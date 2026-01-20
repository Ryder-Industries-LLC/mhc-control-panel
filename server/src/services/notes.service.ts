/**
 * Notes Service
 *
 * Consolidated service for all note-related operations.
 * Supports categorized notes: note, pm, dm, public_chat, tip_menu, tips
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type NoteCategory = 'note' | 'pm' | 'dm' | 'public_chat' | 'tip_menu' | 'tips';

export interface Note {
  id: string;
  profile_id: number;
  content: string;
  category: NoteCategory;
  formatted_content: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NoteQueryOptions {
  category?: NoteCategory;
  limit?: number;
  offset?: number;
}

export interface TipEvent {
  username: string;
  tokens: number;
  message?: string;
}

export interface TipMenuItem {
  item: string;
  tokens: number;
}

export interface ParsedChatLog {
  formatted: string;
  userColors: Map<string, string>;
  messageCount: number;
  // Extracted data for auto-creating additional notes
  extractedTips: TipEvent[];
  extractedTipMenu: TipMenuItem[];
  tipsFormatted: string | null;      // Formatted HTML for tips note
  tipMenuFormatted: string | null;   // Formatted HTML for tip menu note
}

export interface ParsedTipMenu {
  formatted: string;
  items: TipMenuItem[];
}

export interface ParsedPMLog {
  formatted: string;
  messageCount: number;
  participants: string[];
}

// Bright colors for chat usernames (readable on dark background)
const USERNAME_COLORS = [
  '#FF6B6B', // coral red
  '#4ECDC4', // teal
  '#45B7D1', // sky blue
  '#96CEB4', // sage green
  '#FFEAA7', // soft yellow
  '#DDA0DD', // plum
  '#98D8C8', // mint
  '#F7DC6F', // gold
  '#BB8FCE', // lavender
  '#85C1E9', // light blue
  '#F8B500', // amber
  '#00CED1', // dark cyan
  '#FF69B4', // hot pink
  '#98FB98', // pale green
  '#FFA07A', // light salmon
];

export class NotesService {
  /**
   * Get notes for a profile with optional filtering
   */
  static async getNotes(
    profileId: number,
    options: NoteQueryOptions = {}
  ): Promise<{ notes: Note[]; total: number }> {
    const { category, limit = 20, offset = 0 } = options;

    const whereClause = category
      ? 'WHERE profile_id = $1 AND category = $2'
      : 'WHERE profile_id = $1';

    const countParams = category ? [profileId, category] : [profileId];
    const notesParams = category
      ? [profileId, category, limit, offset]
      : [profileId, limit, offset];

    const countSql = `SELECT COUNT(*) FROM profile_notes ${whereClause}`;
    const notesSql = `
      SELECT * FROM profile_notes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${category ? 3 : 2} OFFSET $${category ? 4 : 3}
    `;

    try {
      const [countResult, notesResult] = await Promise.all([
        query(countSql, countParams),
        query(notesSql, notesParams),
      ]);

      return {
        notes: notesResult.rows.map(this.mapRowToNote),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting notes', { error, profileId, category });
      throw error;
    }
  }

  /**
   * Get a single note by ID
   */
  static async getById(noteId: string): Promise<Note | null> {
    const sql = `SELECT * FROM profile_notes WHERE id = $1`;

    try {
      const result = await query(sql, [noteId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error getting note by ID', { error, noteId });
      throw error;
    }
  }

  /**
   * Add a new note to a profile
   */
  static async addNote(
    profileId: number,
    content: string,
    category: NoteCategory = 'note',
    formattedContent?: string,
    sourceUrl?: string
  ): Promise<Note> {
    const sql = `
      INSERT INTO profile_notes (profile_id, content, category, formatted_content, source_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    try {
      const result = await query(sql, [
        profileId,
        content,
        category,
        formattedContent || null,
        sourceUrl || null,
      ]);
      logger.info('Note added', { profileId, noteId: result.rows[0].id, category });
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error adding note', { error, profileId, category });
      throw error;
    }
  }

  /**
   * Update an existing note
   */
  static async updateNote(
    noteId: string,
    data: {
      content?: string;
      category?: NoteCategory;
      formatted_content?: string | null;
      source_url?: string | null;
      created_at?: Date | string;
    }
  ): Promise<Note | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(data.content);
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(data.category);
    }

    if (data.formatted_content !== undefined) {
      updates.push(`formatted_content = $${paramIndex++}`);
      values.push(data.formatted_content);
    }

    if (data.source_url !== undefined) {
      updates.push(`source_url = $${paramIndex++}`);
      values.push(data.source_url);
    }

    if (data.created_at !== undefined) {
      updates.push(`created_at = $${paramIndex++}`);
      values.push(data.created_at);
    }

    if (updates.length === 0) {
      return this.getById(noteId);
    }

    updates.push('updated_at = NOW()');
    values.push(noteId);

    const sql = `
      UPDATE profile_notes
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Note updated', { noteId });
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error updating note', { error, noteId });
      throw error;
    }
  }

  /**
   * Delete a note
   */
  static async deleteNote(noteId: string): Promise<boolean> {
    const sql = `DELETE FROM profile_notes WHERE id = $1 RETURNING id`;

    try {
      const result = await query(sql, [noteId]);
      const deleted = result.rowCount !== null && result.rowCount > 0;
      if (deleted) {
        logger.info('Note deleted', { noteId });
      }
      return deleted;
    } catch (error) {
      logger.error('Error deleting note', { error, noteId });
      throw error;
    }
  }

  /**
   * Get total note count for a profile, optionally filtered by category
   */
  static async getCount(profileId: number, category?: NoteCategory): Promise<number> {
    const sql = category
      ? `SELECT COUNT(*) FROM profile_notes WHERE profile_id = $1 AND category = $2`
      : `SELECT COUNT(*) FROM profile_notes WHERE profile_id = $1`;

    const params = category ? [profileId, category] : [profileId];

    try {
      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting note count', { error, profileId, category });
      throw error;
    }
  }

  /**
   * Get the latest tip menu note for a profile
   */
  static async getLatestTipMenu(profileId: number): Promise<Note | null> {
    const sql = `
      SELECT * FROM profile_notes
      WHERE profile_id = $1 AND category = 'tip_menu'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query(sql, [profileId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error getting latest tip menu', { error, profileId });
      throw error;
    }
  }

  /**
   * Check if a profile has any tip menu notes
   */
  static async hasTipMenu(profileId: number): Promise<boolean> {
    const count = await this.getCount(profileId, 'tip_menu');
    return count > 0;
  }

  /**
   * Parse a pasted chat log and format it with chat bubbles
   * - Supports bookmarklet format: "Timestamp: [...] | Username: [...] | Message: [...] | isBroadcaster: [...]"
   * - Filters out noise (notices, rules, join/leave, tip menus, Lovense, etc.)
   * - Uses knownBroadcaster (profile username) as primary broadcaster identifier
   * - Falls back to detecting broadcaster from "Broadcaster X has left" if not provided
   * - Formats as LEFT (other users) / RIGHT (broadcaster) chat bubbles
   * - Extracts tips and tip menu items for auto-creating separate notes
   * - Handles Chaturbate copy/paste quirk where colons are stripped from usernames
   */
  static parseChatLog(rawText: string, knownBroadcaster?: string): ParsedChatLog {
    const lines = rawText.split('\n');

    // Check if this is bookmarklet format (structured with Timestamp/Username/Message/isBroadcaster)
    // Format: "Timestamp: [21:42:31] | Username: [yiyo10_] | Message: [hello] | isBroadcaster: [true]"
    const bookmarkletPattern = /^Timestamp:\s*\[([^\]]*)\]\s*\|\s*Username:\s*\[([^\]]*)\]\s*\|\s*Message:\s*\[([^\]]*)\]\s*\|\s*isBroadcaster:\s*\[(true|false)\]/i;
    const firstNonEmptyLine = lines.find(l => l.trim().length > 0);
    if (firstNonEmptyLine && bookmarkletPattern.test(firstNonEmptyLine)) {
      return this.parseBookmarkletFormat(lines, knownBroadcaster);
    }

    // Continue with standard parsing for native CB copy/paste
    const userColors = new Map<string, string>();
    let colorIndex = 0;
    const formattedLines: string[] = [];

    // Use knownBroadcaster as primary source (this is the profile username)
    let detectedBroadcaster: string | null = knownBroadcaster?.toLowerCase() || null;

    // Extracted data for additional notes
    const extractedTips: TipEvent[] = [];
    const extractedTipMenu: TipMenuItem[] = [];

    // Only try to detect from chat if knownBroadcaster wasn't provided
    if (!detectedBroadcaster) {
      const broadcasterDetectPattern = /^Broadcaster\s+([a-zA-Z0-9_]+)\s+has\s+(left|joined)/i;
      for (const line of lines) {
        const match = line.trim().match(broadcasterDetectPattern);
        if (match) {
          detectedBroadcaster = match[1].toLowerCase();
          break;
        }
      }
    }

    // First pass: collect known usernames from various line formats
    // This helps us parse lines where the colon was stripped
    const knownUsernames = new Set<string>();

    // Pattern for lines with colons
    const chatPatternWithColon = /^([a-zA-Z0-9_]+)[:：]\s*.+$/;
    // Pattern for lines with rating badges like "|100|"
    const ratingBadgePattern = /^([a-zA-Z0-9_]+)\s*\|\d+\|\s*.+$/;
    // Pattern for tip notifications (extract tipper username)
    const tipperPattern = /^([a-zA-Z0-9_]+)\s+(?:has\s+)?tipped\s+\d+/i;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check colon pattern
      const colonMatch = trimmed.match(chatPatternWithColon);
      if (colonMatch) {
        knownUsernames.add(colonMatch[1].toLowerCase());
        continue;
      }

      // Check rating badge pattern
      const ratingMatch = trimmed.match(ratingBadgePattern);
      if (ratingMatch) {
        knownUsernames.add(ratingMatch[1].toLowerCase());
        continue;
      }

      // Check tipper pattern (these users might also chat)
      const tipperMatch = trimmed.match(tipperPattern);
      if (tipperMatch) {
        knownUsernames.add(tipperMatch[1].toLowerCase());
      }
    }

    // Add broadcaster to known usernames if we have one
    if (detectedBroadcaster) {
      knownUsernames.add(detectedBroadcaster.toLowerCase());
    }

    // Tip menu item patterns (for extraction)
    const tipMenuPatterns = [
      /^(\d+)\s*[-–—:]\s*(.+?)$/i,  // "100 - item"
      /^(.+?)\s*[-–—:]\s*(\d+)\s*(?:tokens?|tk)?$/i,  // "item - 100 tokens"
      /^(.+?):\s*(\d+)\s*(?:tokens?|tk)?$/i,  // "item: 100"
      /^(.+?)\s*\((\d+)\)\s*$/i,  // "item (100)" - fixed pattern
      /^(.+?)\s*\[(\d+)\]\s*$/i,  // "item [100]"
    ];

    // Notice line tip menu pattern: "Notice: ⭐ Item Name (123)" or "Notice: ⚡ Item (45)"
    const noticeMenuPattern = /^Notice:\s*[⭐⚡🔥💎✨🎯•]\s*(.+?)\s*\((\d+)\)\s*$/i;

    // Patterns to COMPLETELY filter out (noise) - but NOT tip menu items (we extract those)
    const noisePatterns = [
      // Join/leave messages
      /has joined the room/i,
      /has left the room/i,
      /has entered the room/i,
      /^Broadcaster\s*[a-zA-Z0-9_]*\s*(has\s+)?(left|joined)/i,
      // Room status changes
      /room is now/i,
      /has changed the room subject/i,
      /roomsubject changed to/i,
      /has started a private show/i,
      /has ended the private show/i,
      /^Privateshow has (started|ended)/i,
      /spy private show/i,
      /has purchased/i,
      // System tags
      /^\[system\]/i,
      /^\[notice\]/i,
      // Keyboard shortcut instructions
      /^To go to next room/i,
      /^To send a tip/i,
      /^To disable emoticons/i,
      /press Ctrl\+/i,
      /click the .* tab/i,
      // App running notices
      /is running these apps/i,
      // Lovense patterns (including random activation)
      /Lovense.*activated/i,
      /Lovense.*is now/i,
      /Lush.*activated/i,
      /Lush.*is now/i,
      /Domi.*activated/i,
      /RANDOMLY activated.*Lovense/i,
      /has RANDOMLY activated/i,
      /vibrating.*for/i,
      /Interactive toy/i,
      // Silence/mute
      /silence/i,
      /has been silenced/i,
      /is now unmuted/i,
      // Goal notices (not tip menu)
      /^Goal:/i,
      /^Current Goal:/i,
      /tokens remaining\]/i,
      // Rules/instructions (multi-line blocks often start with these)
      /^Rules:/i,
      /^Room Rules:/i,
      /^NO\s+/i,
      /^Don't\s+/i,
      /^Please\s+(do not|don't|no)/i,
      // Empty or very short lines
      /^[-=_*]{3,}$/,
      /^[~•◦▪▸►]+$/,
      // Fan club / subscription notices
      /has become a fan/i,
      /joined.*fan club/i,
      /subscribed/i,
      // Media share notices
      /has shared/i,
      /media was played/i,
      // Mod notices
      /has been made a moderator/i,
      /is no longer a moderator/i,
      // King of the room
      /is now the king/i,
      /is the new king/i,
      // Welcome notices (without menu items)
      /^Notice:\s*[⚡⭐🔥💎✨🎯]*\s*Welcome/i,
    ];

    // Tip pattern - extract and show in chat
    const tipPattern = /^([a-zA-Z0-9_]+)\s+(?:has\s+)?tipped\s+(\d+)\s*(?:tokens?|tk)?(?:\s*[-–—]\s*(.+))?$/i;

    // Chat message pattern - require colon or fullwidth colon
    const chatPattern = /^([a-zA-Z0-9_]+)[:：]\s*(.+)$/;

    // Track if we're in a Notice block (tip menu often follows "Notice:" or "Tip Menu:")
    let inTipMenuSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        inTipMenuSection = false; // Reset on empty line
        continue;
      }

      // Detect tip menu section headers
      if (/^(Notice:\s*)?(Tip Menu|TIP MENU|Menu)/i.test(trimmedLine)) {
        inTipMenuSection = true;
        continue;
      }

      // Check for tip notifications (extract only, don't show in public chat)
      const tipMatch = trimmedLine.match(tipPattern);
      if (tipMatch) {
        const [, username, tokensStr, message] = tipMatch;
        const tokens = parseInt(tokensStr, 10);

        // Extract tip for tips note (separate from chat)
        extractedTips.push({ username, tokens, message: message?.trim() });
        continue; // Skip adding to chat display
      }

      // Try to extract tip menu items from Notice lines with emoji pattern
      // e.g., "Notice: ⭐ Show 1 Dick (choose a guy) (75)"
      const noticeMenuMatch = trimmedLine.match(noticeMenuPattern);
      if (noticeMenuMatch) {
        const item = noticeMenuMatch[1].trim();
        const tokens = parseInt(noticeMenuMatch[2], 10);

        if (item && !isNaN(tokens) && tokens > 0 && tokens < 100000 && item.length > 1 && item.length < 150) {
          // Check it's not a duplicate
          if (!extractedTipMenu.some(m => m.item.toLowerCase() === item.toLowerCase() && m.tokens === tokens)) {
            extractedTipMenu.push({ item, tokens });
          }
        }
        continue; // Don't add to chat
      }

      // Try to extract tip menu items (from Notice blocks or standalone lines)
      let tipMenuExtracted = false;
      if (inTipMenuSection || /\d+\s*(tk|tokens?|tks)?/i.test(trimmedLine) || /\(\d+\)\s*$/.test(trimmedLine)) {
        for (const pattern of tipMenuPatterns) {
          const match = trimmedLine.match(pattern);
          if (match) {
            // Pattern 1 has tokens first, others have item first
            const isTokensFirst = pattern === tipMenuPatterns[0];
            const item = isTokensFirst ? match[2].trim() : match[1].trim();
            const tokens = parseInt(isTokensFirst ? match[1] : match[2], 10);

            if (item && !isNaN(tokens) && tokens > 0 && tokens < 100000 && item.length > 1 && item.length < 150) {
              // Check it's not a duplicate
              if (!extractedTipMenu.some(m => m.item.toLowerCase() === item.toLowerCase() && m.tokens === tokens)) {
                extractedTipMenu.push({ item, tokens });
              }
              tipMenuExtracted = true;
              break;
            }
          }
        }
      }

      // If we extracted a tip menu item, don't add to chat
      if (tipMenuExtracted) continue;

      // Filter out all noise patterns
      if (noisePatterns.some((pattern) => pattern.test(trimmedLine))) {
        continue;
      }

      // Skip lines that look like tip menu items but weren't captured
      if (/^\d+\s*[-–—:]\s*.+/.test(trimmedLine) || /^.+\s*[-–—:]\s*\d+\s*(tk|tokens?)?$/i.test(trimmedLine)) {
        continue;
      }

      // Parse as chat message
      // Chaturbate chat has several formats:
      // 1. "username: message" (standard with colon)
      // 2. "username|100| message" (with rating badge)
      // 3. "usernameMessage" (no colon, username runs into message)
      let username: string | null = null;
      let message: string | null = null;

      // Pattern 1: Standard format with colon
      const colonMatch = trimmedLine.match(chatPattern);
      if (colonMatch) {
        username = colonMatch[1];
        message = colonMatch[2];
      }

      // Pattern 2: Username with rating badge like "|100|" or " |100|"
      // Examples: "rub4xlhung |100| how tall are you", "aeastview|100| putain"
      if (!username) {
        const ratingMatch = trimmedLine.match(/^([a-zA-Z0-9_]+)\s*\|(\d+)\|\s*(.+)$/);
        if (ratingMatch) {
          username = ratingMatch[1];
          message = ratingMatch[3];
          // Note: ratingMatch[2] is the rating number, we could display it but skip for now
        }
      }

      // Pattern 3: Known username at start (handles no-colon cases)
      // Try longest usernames first to avoid partial matches
      if (!username) {
        const sortedUsernames = Array.from(knownUsernames).sort((a, b) => b.length - a.length);
        for (const knownUser of sortedUsernames) {
          // Escape special regex characters in username
          const escapedUser = knownUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match username followed by any non-empty content
          const regex = new RegExp(`^(${escapedUser})(.+)$`, 'i');
          const noColonMatch = trimmedLine.match(regex);
          if (noColonMatch && noColonMatch[2].trim().length > 0) {
            username = noColonMatch[1];
            message = noColonMatch[2];
            break;
          }
        }
      }

      // Pattern 4: Heuristic - username (can start with letter or number) followed by capital letter
      // This catches new users like "49erfeverThat's gotta be bigger"
      // Usernames: 3-25 chars, alphanumeric + underscore
      if (!username) {
        const heuristicMatch = trimmedLine.match(/^([a-zA-Z0-9][a-zA-Z0-9_]{2,24})([A-Z].{2,})$/);
        if (heuristicMatch) {
          const potentialUser = heuristicMatch[1];
          const potentialMsg = heuristicMatch[2];
          // Validate it looks like a username (not all numbers)
          if (!/^\d+$/.test(potentialUser)) {
            username = potentialUser;
            message = potentialMsg;
          }
        }
      }

      // Pattern 5: Heuristic for usernames ending in numbers followed by lowercase
      // Look for transition from digit to lowercase letter: "user123message"
      if (!username) {
        const transitionMatch = trimmedLine.match(/^([a-zA-Z][a-zA-Z0-9_]*\d)([a-z].{2,})$/);
        if (transitionMatch) {
          const potentialUser = transitionMatch[1];
          const potentialMsg = transitionMatch[2];
          if (potentialUser.length >= 3 && potentialUser.length <= 25 && potentialMsg.length >= 3) {
            username = potentialUser;
            message = potentialMsg;
          }
        }
      }

      if (username && message) {
        const lowerUsername = username.toLowerCase();

        // Skip if message is empty or just punctuation
        if (/^[.!?,;:\s]*$/.test(message)) continue;

        // Skip if this looks like a system username
        if (['notice', 'system', 'bot', 'admin', 'moderator', 'tip', 'menu'].includes(lowerUsername)) continue;

        // Assign color to username if new
        if (!userColors.has(lowerUsername)) {
          userColors.set(lowerUsername, USERNAME_COLORS[colorIndex % USERNAME_COLORS.length]);
          colorIndex++;
        }

        const color = userColors.get(lowerUsername)!;
        const isBroadcaster = detectedBroadcaster && lowerUsername === detectedBroadcaster.toLowerCase();
        const bubbleClass = isBroadcaster ? 'chat-bubble-right' : 'chat-bubble-left';
        // Apply inline style for broadcaster to ensure orange background shows
        const inlineStyle = isBroadcaster
          ? 'style="background: rgba(252, 83, 10, 0.65); border-left: 4px solid #fc530a; margin-left: 32px; padding: 8px 12px;"'
          : '';

        // Format message with @username highlighting
        const formattedMessage = this.formatMentions(message, userColors);

        formattedLines.push(
          `<div class="${bubbleClass}" ${inlineStyle}><span class="chat-username" style="color:${color}">${this.escapeHtml(username)}</span><span class="chat-message">${formattedMessage}</span></div>`
        );
      }
    }

    // Build the formatted output with CSS for bubbles
    const chatCss = `
      <style>
        .chat-log-bubbles { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
        .chat-bubble-left, .chat-bubble-right {
          max-width: 90%;
          padding: 6px 10px;
          border-radius: 8px;
          display: inline-block;
        }
        .chat-bubble-left {
          align-self: flex-start;
          background: rgba(255,255,255,0.08);
          font-size: 0.9em;
        }
        .chat-bubble-right {
          align-self: flex-start;
          margin-left: 32px;
          background: rgba(252, 83, 10, 0.65) !important;
          font-size: 1em;
          padding: 8px 12px;
          border-left: 4px solid #fc530a;
        }
        .chat-username { font-weight: bold; margin-right: 6px; }
        .chat-message { color: rgba(255,255,255,0.9); }
        .chat-mention { font-weight: bold; }
        .chat-bubble-tip {
          align-self: center;
          background: rgba(245, 158, 11, 0.15);
          padding: 6px 16px;
          border-radius: 16px;
          font-size: 0.9em;
          text-align: center;
        }
        .tip-amount { color: #f59e0b; font-weight: bold; }
      </style>
    `;

    // Generate formatted HTML for tips note (if any tips found)
    let tipsFormatted: string | null = null;
    if (extractedTips.length > 0) {
      // Sort by tokens descending
      const sortedTips = [...extractedTips].sort((a, b) => b.tokens - a.tokens);
      const totalTokens = sortedTips.reduce((sum, t) => sum + t.tokens, 0);

      const tipsCss = `
        <style>
          .tips-tracker { width: 100%; }
          .tips-summary { padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; margin-bottom: 12px; text-align: center; }
          .tips-total { font-size: 1.5em; font-weight: bold; color: #f59e0b; }
          .tips-count { color: rgba(255,255,255,0.6); font-size: 0.9em; }
          .tips-table { width: 100%; border-collapse: collapse; }
          .tips-table th { text-align: left; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); font-size: 0.9em; }
          .tips-table td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
          .tips-table .tip-user { color: rgba(255,255,255,0.9); }
          .tips-table .tip-tokens { color: #f59e0b; font-weight: bold; text-align: right; }
          .tips-table .tip-message { color: rgba(255,255,255,0.5); font-size: 0.9em; }
        </style>
      `;

      const tipsRows = sortedTips.map(t => `
        <tr>
          <td class="tip-user">${this.escapeHtml(t.username)}</td>
          <td class="tip-tokens">${t.tokens}</td>
          <td class="tip-message">${t.message ? this.escapeHtml(t.message) : ''}</td>
        </tr>
      `).join('');

      tipsFormatted = `${tipsCss}
        <div class="tips-tracker">
          <div class="tips-summary">
            <div class="tips-total">${totalTokens.toLocaleString()} tokens</div>
            <div class="tips-count">${sortedTips.length} tip${sortedTips.length !== 1 ? 's' : ''}</div>
          </div>
          <table class="tips-table">
            <thead><tr><th>Tipper</th><th>Amount</th><th>Message</th></tr></thead>
            <tbody>${tipsRows}</tbody>
          </table>
        </div>
      `;
    }

    // Generate formatted HTML for tip menu note (if any items found)
    let tipMenuFormatted: string | null = null;
    if (extractedTipMenu.length > 0) {
      // Sort by tokens ascending
      const sortedMenu = [...extractedTipMenu].sort((a, b) => a.tokens - b.tokens);

      const menuCss = `
        <style>
          .tip-menu-table { width: 100%; border-collapse: collapse; }
          .tip-menu-table thead th { text-align: left; padding: 8px 12px; border-bottom: 2px solid rgba(245, 158, 11, 0.3); color: rgba(255,255,255,0.7); font-size: 0.9em; }
          .tip-menu-table tbody td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
          .tip-menu-item { color: rgba(255,255,255,0.9); }
          .tip-menu-tokens { color: #f59e0b; font-weight: bold; text-align: right; }
        </style>
      `;

      const menuRows = sortedMenu.map(m => {
        // Strip "Notice: " prefix and emojis from item name
        const cleanItem = m.item
          .replace(/^Notice:\s*/i, '')
          .replace(/^[⭐⚡🔥💎✨🎯•]\s*/, '')
          .trim();
        return `
        <tr>
          <td class="tip-menu-item">${this.escapeHtml(cleanItem)}</td>
          <td class="tip-menu-tokens">${m.tokens}</td>
        </tr>
      `;
      }).join('');

      tipMenuFormatted = `${menuCss}
        <table class="tip-menu-table">
          <thead><tr><th>Item</th><th>Tokens</th></tr></thead>
          <tbody>${menuRows}</tbody>
        </table>
      `;
    }

    return {
      formatted: `${chatCss}<div class="chat-log-bubbles">${formattedLines.join('')}</div>`,
      userColors,
      messageCount: formattedLines.length,
      extractedTips,
      extractedTipMenu,
      tipsFormatted,
      tipMenuFormatted,
    };
  }

  /**
   * Parse chat log in bookmarklet format
   * Format: "Timestamp: [21:42:31] | Username: [yiyo10_] | Message: [hello] | isBroadcaster: [true]"
   * This format is much more reliable as it preserves structure from the DOM
   */
  private static parseBookmarkletFormat(lines: string[], knownBroadcaster?: string): ParsedChatLog {
    const userColors = new Map<string, string>();
    let colorIndex = 0;
    const formattedLines: string[] = [];

    const bookmarkletPattern = /^Timestamp:\s*\[([^\]]*)\]\s*\|\s*Username:\s*\[([^\]]*)\]\s*\|\s*Message:\s*\[([^\]]*)\]\s*\|\s*isBroadcaster:\s*\[(true|false)\]/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(bookmarkletPattern);
      if (!match) continue;

      const [, timestamp, username, message, isBroadcasterStr] = match;
      const isBroadcaster = isBroadcasterStr.toLowerCase() === 'true';

      // Skip empty messages
      if (!message || !message.trim()) continue;

      const lowerUsername = username.toLowerCase();

      // Assign color to username if new
      if (!userColors.has(lowerUsername)) {
        userColors.set(lowerUsername, USERNAME_COLORS[colorIndex % USERNAME_COLORS.length]);
        colorIndex++;
      }

      const color = userColors.get(lowerUsername)!;
      const bubbleClass = isBroadcaster ? 'chat-bubble-right' : 'chat-bubble-left';
      const inlineStyle = isBroadcaster
        ? 'style="background: rgba(252, 83, 10, 0.65); border-left: 4px solid #fc530a; margin-left: 32px; padding: 8px 12px;"'
        : '';

      // Format message with @username highlighting
      const formattedMessage = this.formatMentions(message, userColors);

      // Optionally include timestamp
      const timestampHtml = timestamp
        ? `<span class="chat-timestamp" style="color:rgba(255,255,255,0.4);font-size:0.8em;margin-right:6px;">[${this.escapeHtml(timestamp)}]</span>`
        : '';

      formattedLines.push(
        `<div class="${bubbleClass}" ${inlineStyle}>${timestampHtml}<span class="chat-username" style="color:${color}">${this.escapeHtml(username)}</span><span class="chat-message">${formattedMessage}</span></div>`
      );
    }

    // Build CSS (same as standard parser)
    const chatCss = `
      <style>
        .chat-log-bubbles { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
        .chat-bubble-left, .chat-bubble-right {
          max-width: 90%;
          padding: 6px 10px;
          border-radius: 8px;
          display: inline-block;
        }
        .chat-bubble-left {
          align-self: flex-start;
          background: rgba(255,255,255,0.08);
          font-size: 0.9em;
        }
        .chat-bubble-right {
          align-self: flex-start;
          margin-left: 32px;
          background: rgba(252, 83, 10, 0.65) !important;
          font-size: 1em;
          padding: 8px 12px;
          border-left: 4px solid #fc530a;
        }
        .chat-username { font-weight: bold; margin-right: 6px; }
        .chat-message { color: rgba(255,255,255,0.9); }
        .chat-mention { font-weight: bold; }
        .chat-timestamp { font-family: monospace; }
      </style>
    `;

    return {
      formatted: `${chatCss}<div class="chat-log-bubbles">${formattedLines.join('')}</div>`,
      userColors,
      messageCount: formattedLines.length,
      extractedTips: [],       // Bookmarklet format doesn't include tips
      extractedTipMenu: [],    // Bookmarklet format doesn't include tip menu
      tipsFormatted: null,
      tipMenuFormatted: null,
    };
  }

  /**
   * Parse a pasted tip menu and format it as a table
   * Supports multiple formats:
   * - "Item Name - 100 tokens"
   * - "100 - Item Name"
   * - "Item Name: 100"
   * - "Item Name (100)"
   */
  static parseTipMenu(rawText: string): ParsedTipMenu {
    const lines = rawText.split('\n').filter((line) => line.trim());
    const items: TipMenuItem[] = [];

    // Patterns to match tip menu items
    const patterns = [
      // "Item Name - 100 tokens" or "Item Name - 100"
      /^(.+?)\s*[-–—]\s*(\d+)\s*(?:tokens?|tk)?$/i,
      // "100 - Item Name" or "100 tokens - Item Name"
      /^(\d+)\s*(?:tokens?|tk)?\s*[-–—]\s*(.+)$/i,
      // "Item Name: 100"
      /^(.+?):\s*(\d+)\s*(?:tokens?|tk)?$/i,
      // "Item Name (100)" or "Item Name [100]"
      /^(.+?)\s*[(\[]\s*(\d+)\s*(?:tokens?|tk)?\s*[)\]]$/i,
    ];

    for (const line of lines) {
      let trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Strip "Notice: " prefix and any leading emoji
      trimmedLine = trimmedLine
        .replace(/^Notice:\s*/i, '')
        .replace(/^[⭐⚡🔥💎✨🎯•]\s*/, '')
        .trim();

      if (!trimmedLine) continue;

      let matched = false;

      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          // Pattern 2 has tokens first, others have item first
          const isTokensFirst = pattern === patterns[1];
          const item = isTokensFirst ? match[2].trim() : match[1].trim();
          const tokens = parseInt(isTokensFirst ? match[1] : match[2], 10);

          if (item && !isNaN(tokens) && tokens > 0) {
            items.push({ item, tokens });
            matched = true;
            break;
          }
        }
      }

      // If no pattern matched, try to extract any number as tokens
      if (!matched) {
        const numberMatch = trimmedLine.match(/(\d+)/);
        if (numberMatch) {
          const tokens = parseInt(numberMatch[1], 10);
          const item = trimmedLine.replace(/\d+\s*(?:tokens?|tk)?/gi, '').trim();
          if (item && tokens > 0) {
            items.push({ item, tokens });
          }
        }
      }
    }

    // Sort by tokens (ascending)
    items.sort((a, b) => a.tokens - b.tokens);

    // Generate formatted HTML table
    const tableRows = items
      .map(
        ({ item, tokens }) =>
          `<tr><td class="tip-menu-item">${this.escapeHtml(item)}</td><td class="tip-menu-tokens">${tokens}</td></tr>`
      )
      .join('');

    const formatted = `
      <table class="tip-menu-table">
        <thead>
          <tr><th>Item</th><th>Tokens</th></tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    return { formatted, items };
  }

  /**
   * Get notes preview (first 100 chars) for a profile
   * Used by visitors and room presence services
   */
  static async getNotesPreview(profileId: number): Promise<string | null> {
    const sql = `
      SELECT content FROM profile_notes
      WHERE profile_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query(sql, [profileId]);
      if (result.rows.length === 0) {
        return null;
      }
      const content = result.rows[0].content;
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    } catch (error) {
      logger.error('Error getting notes preview', { error, profileId });
      return null;
    }
  }

  /**
   * Get notes preview by person_id (resolves profile_id internally)
   * Used by room-presence.service.ts for enrichOccupant
   */
  static async getNotesPreviewByPersonId(personId: string): Promise<string | null> {
    const sql = `
      SELECT pn.content
      FROM profile_notes pn
      JOIN profiles p ON p.id = pn.profile_id
      WHERE p.person_id = $1
      ORDER BY pn.created_at DESC
      LIMIT 1
    `;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }
      const content = result.rows[0].content;
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    } catch (error) {
      logger.error('Error getting notes preview by person_id', { error, personId });
      return null;
    }
  }

  /**
   * Parse a pasted PM or DM conversation log and format it with alternating chat bubbles
   * - PM/DM are always 2-way conversations between exactly 2 participants
   * - First speaker: left-aligned bubbles
   * - Second speaker: right-aligned (indented) bubbles
   * - Simpler parsing than public chat (no noise filtering, tips extraction)
   */
  static parsePMLog(rawText: string, category: 'pm' | 'dm' = 'pm'): ParsedPMLog {
    const lines = rawText.split('\n');
    const formattedLines: string[] = [];
    const participants: string[] = [];
    const userColors = new Map<string, string>();

    // Pattern: "username: message" or "[timestamp] username: message"
    const chatPattern = /^(?:\[.*?\]\s*)?([a-zA-Z0-9_]+)[:：]\s*(.+)$/;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const match = trimmedLine.match(chatPattern);
      if (match) {
        const [, username, message] = match;
        const lowerUsername = username.toLowerCase();

        // Skip if message is empty or just punctuation
        if (!message || /^[.!?,;:\s]*$/.test(message)) continue;

        // Track participants (first 2 only)
        if (!participants.includes(lowerUsername) && participants.length < 2) {
          participants.push(lowerUsername);
          // Assign colors: first user gets coral, second gets teal
          userColors.set(lowerUsername, participants.length === 1 ? '#FF6B6B' : '#4ECDC4');
        }

        // First participant: left, Second participant: right (indented)
        const isFirstParticipant = participants[0] === lowerUsername;
        const color = userColors.get(lowerUsername) || '#FFFFFF';
        const bubbleClass = isFirstParticipant ? 'pm-bubble-left' : 'pm-bubble-right';

        // Format the message
        const escapedMessage = this.escapeHtml(message);
        const escapedUsername = this.escapeHtml(username);

        formattedLines.push(
          `<div class="${bubbleClass}"><span class="pm-username" style="color:${color}">${escapedUsername}</span><span class="pm-message">${escapedMessage}</span></div>`
        );
      }
    }

    // Build the formatted output with CSS for PM/DM bubbles
    const categoryLabel = category.toUpperCase();
    const pmCss = `
      <style>
        .pm-log-bubbles { display: flex; flex-direction: column; gap: 8px; max-width: 100%; }
        .pm-bubble-left, .pm-bubble-right {
          max-width: 85%;
          padding: 8px 12px;
          border-radius: 12px;
          display: inline-block;
        }
        .pm-bubble-left {
          align-self: flex-start;
          background: rgba(255, 107, 107, 0.15);
          border-left: 3px solid #FF6B6B;
        }
        .pm-bubble-right {
          align-self: flex-end;
          margin-left: 40px;
          background: rgba(78, 205, 196, 0.15);
          border-right: 3px solid #4ECDC4;
        }
        .pm-username { font-weight: bold; margin-right: 8px; }
        .pm-message { color: rgba(255,255,255,0.9); }
        .pm-header {
          font-size: 0.85em;
          color: rgba(255,255,255,0.5);
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
      </style>
    `;

    const header = participants.length === 2
      ? `<div class="pm-header">${categoryLabel} conversation between <strong style="color:#FF6B6B">${this.escapeHtml(participants[0])}</strong> and <strong style="color:#4ECDC4">${this.escapeHtml(participants[1])}</strong></div>`
      : '';

    return {
      formatted: `${pmCss}<div class="pm-log-bubbles">${header}${formattedLines.join('')}</div>`,
      messageCount: formattedLines.length,
      participants,
    };
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  }

  /**
   * Format @username mentions in a message with bold and color
   * Uses the userColors map to color known users, defaults to cyan for unknown
   */
  private static formatMentions(message: string, userColors: Map<string, string>): string {
    // First escape the HTML
    let escaped = this.escapeHtml(message);

    // Find @mentions and highlight them
    // Pattern: @ followed by username characters (letters, numbers, underscore)
    const mentionPattern = /@([a-zA-Z0-9_]+)/g;

    escaped = escaped.replace(mentionPattern, (match, username) => {
      const lowerUsername = username.toLowerCase();
      const color = userColors.get(lowerUsername) || '#22d3ee'; // cyan-400 for unknown users
      return `<span class="chat-mention" style="color:${color}">@${username}</span>`;
    });

    return escaped;
  }

  /**
   * Map database row to Note object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapRowToNote(row: any): Note {
    return {
      id: row.id,
      profile_id: row.profile_id,
      content: row.content,
      category: row.category || 'note',
      formatted_content: row.formatted_content,
      source_url: row.source_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
