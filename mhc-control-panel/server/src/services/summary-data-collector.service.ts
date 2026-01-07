/**
 * Summary Data Collector Service
 *
 * Gathers all data needed to generate an AI stream summary.
 * Combines transcript parsing with database queries.
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import {
  transcriptParserService,
  ParsedTranscript,
  VisitorCategories,
} from './transcript-parser.service.js';
import { MyBroadcastService, MyBroadcast } from './my-broadcast.service.js';
import fs from 'fs/promises';
import path from 'path';

export interface SummaryData {
  // From my_broadcasts
  broadcastId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;

  // From transcript parsing
  parsed: ParsedTranscript;
  visitorCategories: VisitorCategories;
  tokensReceived: number;
  tokensPerHour: number;
  uniqueViewers: number;
  avgWatchTimeSeconds: number;
  netFollowers: number;

  // From database
  maxViewers: number;
  friendsList: string[];

  // Context
  instructions: string;
}

export interface BroadcastSummary {
  id: string;
  broadcast_id: string;
  theme: string | null;
  tokens_received: number;
  tokens_per_hour: number | null;
  max_viewers: number | null;
  unique_viewers: number | null;
  avg_watch_time_seconds: number | null;
  new_followers: number;
  lost_followers: number;
  net_followers: number;
  room_subject_variants: string[];
  visitors_stayed: string[];
  visitors_quick: string[];
  visitors_banned: string[];
  top_tippers: Array<{ username: string; tokens: number }>;
  top_lovers_board: Array<{ rank: number; username: string; tokens: number }>;
  overall_vibe: string | null;
  engagement_summary: string | null;
  tracking_notes: string | null;
  private_dynamics: string | null;
  opportunities: string | null;
  chat_highlights: string | null;
  themes_moments: string | null;
  overall_summary: string | null;
  full_markdown: string | null;
  transcript_text: string | null;
  generated_at: Date;
  ai_model: string | null;
  generation_tokens_used: number | null;
  created_at: Date;
  updated_at: Date;
}

// Path to the stream summary instructions
const INSTRUCTIONS_PATH = path.join(process.cwd(), '..', 'STREAM_SUMMARY_INSTRUCTIONS.md');

class SummaryDataCollectorService {
  /**
   * Collect all data needed for AI summary generation
   */
  async collect(broadcastId: string, transcript: string): Promise<SummaryData> {
    logger.info('Collecting summary data', { broadcastId });

    // Get broadcast info
    const broadcast = await MyBroadcastService.getById(broadcastId);
    if (!broadcast) {
      throw new Error(`Broadcast not found: ${broadcastId}`);
    }

    // Parse the transcript
    const parsed = transcriptParserService.parse(transcript);

    // Categorize visitors (1 minute threshold)
    const visitorCategories = transcriptParserService.categorizeVisitors(parsed.visitors, 1);

    // Calculate metrics
    const tokensReceived = parsed.totalTokens;
    const durationMinutes = broadcast.duration_minutes || this.calculateDuration(broadcast);
    const tokensPerHour = durationMinutes > 0 ? (tokensReceived / durationMinutes) * 60 : 0;
    const uniqueViewers = parsed.uniqueUsernames.length;
    const avgWatchTimeSeconds = transcriptParserService.calculateAvgWatchTime(parsed.visitors);
    const netFollowers = parsed.follows.length - parsed.unfollows.length;

    // Get max viewers from affiliate API snapshots during broadcast window
    const maxViewers = await this.getMaxViewers(broadcast);

    // Get friends list from profiles table
    const friendsList = await this.getFriendsList();

    // Load instructions
    const instructions = await this.loadInstructions();

    return {
      broadcastId,
      startedAt: broadcast.started_at,
      endedAt: broadcast.ended_at,
      durationMinutes,
      parsed,
      visitorCategories,
      tokensReceived,
      tokensPerHour: Math.round(tokensPerHour * 100) / 100,
      uniqueViewers,
      avgWatchTimeSeconds,
      netFollowers,
      maxViewers,
      friendsList,
      instructions,
    };
  }

  /**
   * Collect data for preview mode (no database broadcast required)
   * Uses mock broadcast data since we don't have a real broadcast record
   */
  async collectForPreview(transcript: string): Promise<SummaryData> {
    logger.info('Collecting summary data for preview mode');

    // Parse the transcript
    const parsed = transcriptParserService.parse(transcript);

    // Categorize visitors (1 minute threshold)
    const visitorCategories = transcriptParserService.categorizeVisitors(parsed.visitors, 1);

    // Calculate metrics
    const tokensReceived = parsed.totalTokens;
    const uniqueViewers = parsed.uniqueUsernames.length;
    const avgWatchTimeSeconds = transcriptParserService.calculateAvgWatchTime(parsed.visitors);
    const netFollowers = parsed.follows.length - parsed.unfollows.length;

    // For preview, we estimate duration based on chat activity
    // This is approximate - real broadcast would have actual times
    const durationMinutes = 60; // Default to 1 hour for preview
    const tokensPerHour = durationMinutes > 0 ? (tokensReceived / durationMinutes) * 60 : 0;

    // Get friends list from profiles table (still useful for formatting)
    const friendsList = await this.getFriendsList();

    // Load instructions
    const instructions = await this.loadInstructions();

    return {
      broadcastId: 'preview',
      startedAt: new Date(),
      endedAt: new Date(),
      durationMinutes,
      parsed,
      visitorCategories,
      tokensReceived,
      tokensPerHour: Math.round(tokensPerHour * 100) / 100,
      uniqueViewers,
      avgWatchTimeSeconds,
      netFollowers,
      maxViewers: 0, // Unknown for preview
      friendsList,
      instructions,
    };
  }

  /**
   * Calculate duration from broadcast start/end times
   */
  private calculateDuration(broadcast: MyBroadcast): number {
    if (!broadcast.ended_at) {
      return 0;
    }
    return Math.round(
      (broadcast.ended_at.getTime() - broadcast.started_at.getTime()) / (1000 * 60)
    );
  }

  /**
   * Get max viewers from affiliate API snapshots during broadcast window
   */
  private async getMaxViewers(broadcast: MyBroadcast): Promise<number> {
    if (!broadcast.ended_at) {
      return broadcast.peak_viewers || 0;
    }

    try {
      // Query affiliate_api_snapshots for max num_users during broadcast window
      // The snapshots are for Hudson's own profile (username: hudson_cage)
      const result = await query(
        `SELECT COALESCE(MAX(num_users), 0) as max_viewers
         FROM affiliate_api_snapshots aas
         JOIN persons p ON aas.person_id = p.id
         WHERE p.username = 'hudson_cage'
           AND aas.recorded_at >= $1
           AND aas.recorded_at <= $2`,
        [broadcast.started_at, broadcast.ended_at]
      );

      return parseInt(result.rows[0]?.max_viewers || '0');
    } catch (error) {
      logger.warn('Could not fetch max viewers from snapshots', { error });
      return broadcast.peak_viewers || 0;
    }
  }

  /**
   * Get list of friend usernames from profiles table
   */
  private async getFriendsList(): Promise<string[]> {
    try {
      const result = await query(
        `SELECT p.username
         FROM profiles pr
         JOIN persons p ON pr.person_id = p.id
         WHERE pr.friend_tier IS NOT NULL
         ORDER BY pr.friend_tier ASC`
      );

      return result.rows.map((row: any) => row.username);
    } catch (error) {
      logger.warn('Could not fetch friends list', { error });
      return [];
    }
  }

  /**
   * Load stream summary instructions from file
   */
  private async loadInstructions(): Promise<string> {
    try {
      const content = await fs.readFile(INSTRUCTIONS_PATH, 'utf-8');
      return content;
    } catch (error) {
      logger.warn('Could not load instructions file', { error, path: INSTRUCTIONS_PATH });
      return '';
    }
  }

  /**
   * Save a generated summary to the database
   */
  async saveSummary(broadcastId: string, summary: Partial<BroadcastSummary>): Promise<BroadcastSummary> {
    const result = await query(
      `INSERT INTO broadcast_summaries (
        broadcast_id, theme, tokens_received, tokens_per_hour,
        max_viewers, unique_viewers, avg_watch_time_seconds,
        new_followers, lost_followers, net_followers,
        room_subject_variants, visitors_stayed, visitors_quick, visitors_banned,
        top_tippers, top_lovers_board,
        overall_vibe, engagement_summary, tracking_notes, private_dynamics,
        opportunities, chat_highlights, themes_moments, overall_summary,
        full_markdown, transcript_text, ai_model, generation_tokens_used
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28
      )
      ON CONFLICT (broadcast_id) DO UPDATE SET
        theme = EXCLUDED.theme,
        tokens_received = EXCLUDED.tokens_received,
        tokens_per_hour = EXCLUDED.tokens_per_hour,
        max_viewers = EXCLUDED.max_viewers,
        unique_viewers = EXCLUDED.unique_viewers,
        avg_watch_time_seconds = EXCLUDED.avg_watch_time_seconds,
        new_followers = EXCLUDED.new_followers,
        lost_followers = EXCLUDED.lost_followers,
        net_followers = EXCLUDED.net_followers,
        room_subject_variants = EXCLUDED.room_subject_variants,
        visitors_stayed = EXCLUDED.visitors_stayed,
        visitors_quick = EXCLUDED.visitors_quick,
        visitors_banned = EXCLUDED.visitors_banned,
        top_tippers = EXCLUDED.top_tippers,
        top_lovers_board = EXCLUDED.top_lovers_board,
        overall_vibe = EXCLUDED.overall_vibe,
        engagement_summary = EXCLUDED.engagement_summary,
        tracking_notes = EXCLUDED.tracking_notes,
        private_dynamics = EXCLUDED.private_dynamics,
        opportunities = EXCLUDED.opportunities,
        chat_highlights = EXCLUDED.chat_highlights,
        themes_moments = EXCLUDED.themes_moments,
        overall_summary = EXCLUDED.overall_summary,
        full_markdown = EXCLUDED.full_markdown,
        transcript_text = EXCLUDED.transcript_text,
        ai_model = EXCLUDED.ai_model,
        generation_tokens_used = EXCLUDED.generation_tokens_used,
        generated_at = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        broadcastId,
        summary.theme || null,
        summary.tokens_received || 0,
        summary.tokens_per_hour || null,
        summary.max_viewers || null,
        summary.unique_viewers || null,
        summary.avg_watch_time_seconds || null,
        summary.new_followers || 0,
        summary.lost_followers || 0,
        summary.net_followers || 0,
        summary.room_subject_variants || [],
        summary.visitors_stayed || [],
        summary.visitors_quick || [],
        summary.visitors_banned || [],
        JSON.stringify(summary.top_tippers || []),
        JSON.stringify(summary.top_lovers_board || []),
        summary.overall_vibe || null,
        summary.engagement_summary || null,
        summary.tracking_notes || null,
        summary.private_dynamics || null,
        summary.opportunities || null,
        summary.chat_highlights || null,
        summary.themes_moments || null,
        summary.overall_summary || null,
        summary.full_markdown || null,
        summary.transcript_text || null,
        summary.ai_model || null,
        summary.generation_tokens_used || null,
      ]
    );

    logger.info('Broadcast summary saved', { broadcastId });
    return result.rows[0] as BroadcastSummary;
  }

  /**
   * Get summary by broadcast ID
   */
  async getSummaryByBroadcastId(broadcastId: string): Promise<BroadcastSummary | null> {
    const result = await query(
      'SELECT * FROM broadcast_summaries WHERE broadcast_id = $1',
      [broadcastId]
    );
    return result.rows[0] as BroadcastSummary || null;
  }

  /**
   * Update an existing summary
   */
  async updateSummary(broadcastId: string, updates: Partial<BroadcastSummary>): Promise<BroadcastSummary | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'theme', 'overall_vibe', 'engagement_summary', 'tracking_notes',
      'private_dynamics', 'opportunities', 'chat_highlights', 'themes_moments',
      'overall_summary', 'full_markdown'
    ];

    for (const field of allowedFields) {
      if ((updates as any)[field] !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        values.push((updates as any)[field]);
      }
    }

    if (fields.length === 0) {
      return this.getSummaryByBroadcastId(broadcastId);
    }

    values.push(broadcastId);

    const result = await query(
      `UPDATE broadcast_summaries SET ${fields.join(', ')}, updated_at = NOW()
       WHERE broadcast_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] as BroadcastSummary || null;
  }

  /**
   * Delete summary by broadcast ID
   */
  async deleteSummary(broadcastId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM broadcast_summaries WHERE broadcast_id = $1 RETURNING id',
      [broadcastId]
    );
    return (result.rowCount || 0) > 0;
  }
}

export const summaryDataCollectorService = new SummaryDataCollectorService();
