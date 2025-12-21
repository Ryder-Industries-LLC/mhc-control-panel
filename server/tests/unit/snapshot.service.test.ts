import { SnapshotService } from '../../src/services/snapshot.service';
import type { Snapshot } from '../../src/types/models';

describe('SnapshotService', () => {
  describe('computeDelta', () => {
    it('should compute deltas for numeric fields present in both snapshots', () => {
      const oldSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1000,
          tips: 50,
        },
      } as Snapshot;

      const newSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1500,
          tips: 75,
        },
      } as Snapshot;

      const delta = SnapshotService.computeDelta(oldSnapshot, newSnapshot);

      expect(delta).toEqual({
        all_time_tokens: 500,
        tips: 25,
      });
    });

    it('should return null for fields missing in either snapshot', () => {
      const oldSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1000,
        },
      } as Snapshot;

      const newSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1500,
          tips: 75,
        },
      } as Snapshot;

      const delta = SnapshotService.computeDelta(oldSnapshot, newSnapshot);

      expect(delta).toEqual({
        all_time_tokens: 500,
        tips: null,
      });
    });

    it('should include non-numeric values as-is', () => {
      const oldSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1000,
          status: 'active',
        },
      } as Snapshot;

      const newSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1500,
          status: 'verified',
        },
      } as Snapshot;

      const delta = SnapshotService.computeDelta(oldSnapshot, newSnapshot);

      expect(delta).toEqual({
        all_time_tokens: 500,
        status: 'verified',
      });
    });

    it('should return null if either snapshot has no normalized_metrics', () => {
      const oldSnapshot = {
        normalized_metrics: null,
      } as Snapshot;

      const newSnapshot = {
        normalized_metrics: {
          all_time_tokens: 1500,
        },
      } as Snapshot;

      const delta = SnapshotService.computeDelta(oldSnapshot, newSnapshot);

      expect(delta).toBeNull();
    });
  });
});
