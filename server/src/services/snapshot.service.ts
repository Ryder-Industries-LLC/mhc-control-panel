import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { Snapshot, SnapshotSource } from '../types/models.js';

export interface CreateSnapshotParams {
  personId: string;
  source: SnapshotSource;
  capturedAt?: Date;
  rawPayload: Record<string, unknown>;
  normalizedMetrics?: Record<string, unknown> | null;
}

export interface SnapshotDelta {
  [key: string]: number | string | boolean | null | undefined;
}

export class SnapshotService {
  /**
   * Create or update a snapshot.
   * Maintains only two rows per person+source: the oldest (baseline) and the latest (current).
   * - If no rows exist: insert as the first (baseline) row.
   * - If one row exists (the baseline): insert a second row as the latest.
   * - If two rows exist: update the latest row (preserve the oldest baseline).
   */
  static async create(params: CreateSnapshotParams): Promise<Snapshot> {
    const {
      personId,
      source,
      capturedAt = new Date(),
      rawPayload,
      normalizedMetrics = null,
    } = params;

    // Get existing snapshots for this person+source (ordered oldest first)
    const existing = await query<Snapshot>(
      `SELECT id, captured_at FROM snapshots
       WHERE person_id = $1 AND source = $2
       ORDER BY captured_at ASC`,
      [personId, source]
    );

    let result;

    if (existing.rows.length < 2) {
      // 0 or 1 rows exist: insert a new row
      result = await query<Snapshot>(
        `INSERT INTO snapshots (person_id, source, captured_at, raw_payload, normalized_metrics)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [personId, source, capturedAt, JSON.stringify(rawPayload), JSON.stringify(normalizedMetrics)]
      );
    } else {
      // 2+ rows exist: update the latest (last in order) to keep oldest as baseline
      const latestId = existing.rows[existing.rows.length - 1].id;
      result = await query<Snapshot>(
        `UPDATE snapshots
         SET captured_at = $2, raw_payload = $3, normalized_metrics = $4
         WHERE id = $1
         RETURNING *`,
        [latestId, capturedAt, JSON.stringify(rawPayload), JSON.stringify(normalizedMetrics)]
      );
    }

    logger.info(`Created snapshot for person ${personId} from source ${source}`);
    return result.rows[0];
  }

  /**
   * Get latest snapshot for a person and source
   */
  static async getLatest(
    personId: string,
    source: SnapshotSource
  ): Promise<Snapshot | null> {
    const result = await query<Snapshot>(
      `SELECT * FROM snapshots
       WHERE person_id = $1 AND source = $2
       ORDER BY captured_at DESC
       LIMIT 1`,
      [personId, source]
    );
    return result.rows[0] || null;
  }

  /**
   * Compute delta between two snapshots
   * Returns null for fields that are missing in either snapshot
   */
  static computeDelta(
    oldSnapshot: Snapshot,
    newSnapshot: Snapshot
  ): SnapshotDelta | null {
    if (!newSnapshot.normalized_metrics || !oldSnapshot.normalized_metrics) {
      return null;
    }

    const oldMetrics = oldSnapshot.normalized_metrics as Record<string, unknown>;
    const newMetrics = newSnapshot.normalized_metrics as Record<string, unknown>;

    const delta: SnapshotDelta = {};

    // Get all unique keys from both snapshots
    const allKeys = new Set([
      ...Object.keys(newMetrics),
      ...Object.keys(oldMetrics),
    ]);

    for (const key of allKeys) {
      const newValue = newMetrics[key];
      const oldValue = oldMetrics[key];

      // If either value is missing, delta is null
      if (newValue === undefined || oldValue === undefined) {
        delta[key] = null;
        continue;
      }

      // Only compute numeric deltas
      if (typeof newValue === 'number' && typeof oldValue === 'number') {
        delta[key] = newValue - oldValue;
      } else {
        // For non-numeric fields, include the new value
        delta[key] = newValue as string | boolean | null;
      }
    }

    return delta;
  }

  /**
   * Get snapshot delta for a person
   * Compares the latest snapshot against the oldest (baseline) snapshot
   */
  static async getDelta(
    personId: string,
    source: SnapshotSource
  ): Promise<{ delta: SnapshotDelta | null; snapshots: Snapshot[] }> {
    // Get oldest (baseline) and latest
    const result = await query<Snapshot>(
      `(SELECT * FROM snapshots WHERE person_id = $1 AND source = $2 ORDER BY captured_at ASC LIMIT 1)
       UNION ALL
       (SELECT * FROM snapshots WHERE person_id = $1 AND source = $2 ORDER BY captured_at DESC LIMIT 1)`,
      [personId, source]
    );

    const snapshots = result.rows;

    if (snapshots.length < 2 || snapshots[0].id === snapshots[1].id) {
      return { delta: null, snapshots };
    }

    const [oldest, newest] = snapshots;
    const delta = this.computeDelta(oldest, newest);

    return { delta, snapshots: [newest, oldest] };
  }

  /**
   * Get all snapshots for a person
   */
  static async getByPerson(
    personId: string,
    options?: {
      source?: SnapshotSource;
      limit?: number;
      offset?: number;
    }
  ): Promise<Snapshot[]> {
    const { source, limit = 50, offset = 0 } = options || {};

    let sql = 'SELECT * FROM snapshots WHERE person_id = $1';
    const params: unknown[] = [personId];

    if (source) {
      sql += ' AND source = $2';
      params.push(source);
    }

    sql += ' ORDER BY captured_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query<Snapshot>(sql, params);
    return result.rows;
  }

  /**
   * Get snapshots within a date range
   */
  static async getByDateRange(
    personId: string,
    source: SnapshotSource,
    startDate: Date,
    endDate: Date
  ): Promise<Snapshot[]> {
    const result = await query<Snapshot>(
      `SELECT * FROM snapshots
       WHERE person_id = $1
         AND source = $2
         AND captured_at >= $3
         AND captured_at <= $4
       ORDER BY captured_at DESC`,
      [personId, source, startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Get the most recent snapshot within a date range
   * Useful for getting the "latest state" as of a specific period
   */
  static async getLatestInRange(
    personId: string,
    source: SnapshotSource,
    startDate: Date,
    endDate: Date
  ): Promise<Snapshot | null> {
    const result = await query<Snapshot>(
      `SELECT * FROM snapshots
       WHERE person_id = $1
         AND source = $2
         AND captured_at >= $3
         AND captured_at <= $4
       ORDER BY captured_at DESC
       LIMIT 1`,
      [personId, source, startDate, endDate]
    );
    return result.rows[0] || null;
  }

  /**
   * Compare two date ranges for a person
   * Returns the latest snapshot from each period and a comparison delta
   */
  static async compareDateRanges(
    personId: string,
    source: SnapshotSource,
    period1: { start: Date; end: Date },
    period2: { start: Date; end: Date }
  ): Promise<{
    period1Snapshot: Snapshot | null;
    period2Snapshot: Snapshot | null;
    comparisonDelta: SnapshotDelta | null;
  }> {
    const period1Snapshot = await this.getLatestInRange(
      personId,
      source,
      period1.start,
      period1.end
    );

    const period2Snapshot = await this.getLatestInRange(
      personId,
      source,
      period2.start,
      period2.end
    );

    let comparisonDelta = null;
    if (period1Snapshot && period2Snapshot) {
      // period1 is the "old" period, period2 is the "new" period for comparison
      comparisonDelta = this.computeDelta(period1Snapshot, period2Snapshot);
    }

    return {
      period1Snapshot,
      period2Snapshot,
      comparisonDelta,
    };
  }
}
