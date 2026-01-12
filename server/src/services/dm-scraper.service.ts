// @ts-nocheck - Browser context code uses DOM APIs in page.evaluate
import { Page } from 'puppeteer';
import { ChaturbateScraperService } from './chaturbate-scraper.service.js';
import { PersonService } from './person.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

export interface RawDMMessage {
  threadUsername: string;
  messageText: string;
  isFromMe: boolean;
  rawDateText: string | null;
  computedTimestamp: Date | null;
  isTip: boolean;
  tipAmount: number | null;
  tipNote: string | null;
  messageHash: string;
}

export interface DMThread {
  username: string;
  lastMessagePreview: string;
  unreadCount: number;
}

export interface DMScrapeResult {
  success: boolean;
  threadsFound: number;
  messagesScraped: number;
  error?: string;
}

export class DMScraperService {
  private static readonly MESSAGES_URL = 'https://chaturbate.com/messages/';

  /**
   * Generate a hash for deduplication
   */
  private static generateMessageHash(
    threadUsername: string,
    messageText: string,
    rawDateText: string | null,
    isFromMe: boolean
  ): string {
    const data = `${threadUsername}|${messageText}|${rawDateText || ''}|${isFromMe}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Parse relative date text to a computed timestamp
   * Examples:
   * - "Thu 7:30pm" -> needs reference date from prior full date
   * - "January 4, 2026" -> full date header
   * - "Today 3:15pm" -> use current date
   * - "Yesterday 8:00am" -> use yesterday's date
   */
  static parseRelativeDate(
    rawDateText: string,
    referenceDate: Date | null = null
  ): Date | null {
    if (!rawDateText) return null;

    const now = new Date();
    const text = rawDateText.trim().toLowerCase();

    // Full date format: "January 4, 2026" or "Jan 4, 2026"
    const fullDateMatch = text.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (fullDateMatch) {
      const [, monthStr, day, year] = fullDateMatch;
      const months: Record<string, number> = {
        january: 0, jan: 0,
        february: 1, feb: 1,
        march: 2, mar: 2,
        april: 3, apr: 3,
        may: 4,
        june: 5, jun: 5,
        july: 6, jul: 6,
        august: 7, aug: 7,
        september: 8, sep: 8, sept: 8,
        october: 9, oct: 9,
        november: 10, nov: 10,
        december: 11, dec: 11,
      };
      const month = months[monthStr.toLowerCase()];
      if (month !== undefined) {
        return new Date(parseInt(year), month, parseInt(day), 12, 0, 0);
      }
    }

    // Time parsing helper
    const parseTime = (timeStr: string): { hour: number; minute: number } | null => {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!timeMatch) return null;
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      return { hour, minute };
    };

    // "Today 3:15pm"
    if (text.startsWith('today')) {
      const time = parseTime(text);
      if (time) {
        const result = new Date(now);
        result.setHours(time.hour, time.minute, 0, 0);
        return result;
      }
    }

    // "Yesterday 8:00am"
    if (text.startsWith('yesterday')) {
      const time = parseTime(text);
      if (time) {
        const result = new Date(now);
        result.setDate(result.getDate() - 1);
        result.setHours(time.hour, time.minute, 0, 0);
        return result;
      }
    }

    // Day of week with time: "Thu 7:30pm", "Monday 2:00pm"
    const dayTimeMatch = text.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (dayTimeMatch) {
      const time = parseTime(dayTimeMatch[2]);
      if (time && referenceDate) {
        // Use reference date and adjust for time
        const result = new Date(referenceDate);
        result.setHours(time.hour, time.minute, 0, 0);
        return result;
      } else if (time) {
        // Try to find the most recent occurrence of this day
        const days: Record<string, number> = {
          sun: 0, sunday: 0,
          mon: 1, monday: 1,
          tue: 2, tuesday: 2,
          wed: 3, wednesday: 3,
          thu: 4, thursday: 4,
          fri: 5, friday: 5,
          sat: 6, saturday: 6,
        };
        const targetDay = days[dayTimeMatch[1].toLowerCase()];
        if (targetDay !== undefined) {
          const result = new Date(now);
          const currentDay = result.getDay();
          let daysBack = currentDay - targetDay;
          if (daysBack <= 0) daysBack += 7; // Go back to last week
          result.setDate(result.getDate() - daysBack);
          result.setHours(time.hour, time.minute, 0, 0);
          return result;
        }
      }
    }

    // Just a time: "7:30pm" - use reference date or today
    const justTimeMatch = text.match(/^(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i);
    if (justTimeMatch) {
      const time = parseTime(justTimeMatch[1]);
      if (time) {
        const result = referenceDate ? new Date(referenceDate) : new Date(now);
        result.setHours(time.hour, time.minute, 0, 0);
        return result;
      }
    }

    return null;
  }

  /**
   * Detect if a message is a tip and parse the amount
   * Examples:
   * - "You tipped 25 tokens" -> amount: -25 (I gave)
   * - "username tipped 50 tokens" -> amount: 50 (tip to me)
   */
  static parseTipFromMessage(messageText: string, isFromMe: boolean): { isTip: boolean; amount: number | null } {
    const text = messageText.toLowerCase();

    // "You tipped X tokens" - I gave a tip
    const iTippedMatch = text.match(/you\s+tipped\s+(\d+)\s+tokens?/i);
    if (iTippedMatch) {
      return { isTip: true, amount: -parseInt(iTippedMatch[1]) };
    }

    // "username tipped X tokens" - someone tipped me
    const theyTippedMatch = text.match(/(\w+)\s+tipped\s+(\d+)\s+tokens?/i);
    if (theyTippedMatch) {
      return { isTip: true, amount: parseInt(theyTippedMatch[2]) };
    }

    return { isTip: false, amount: null };
  }

  /**
   * Get list of all DM threads from the messages page
   */
  static async getThreadList(page: Page): Promise<DMThread[]> {
    await page.goto(this.MESSAGES_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click "All" filter to show all conversations
    const clickedAll = await page.evaluate(() => {
      const allFilters = document.querySelectorAll('[data-testid="filter-option"], .filter-option, button, a');
      for (const filter of allFilters) {
        const text = filter.textContent?.toLowerCase() || '';
        if (text === 'all' || text.includes('all messages')) {
          (filter as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedAll) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Extract thread list from left panel
    const threads = await page.evaluate(() => {
      const threadItems: { username: string; lastMessagePreview: string; unreadCount: number }[] = [];

      // Look for conversation list items
      const conversationItems = document.querySelectorAll(
        '[data-testid="conversation-item"], .conversation-item, .message-thread, .dm-thread'
      );

      conversationItems.forEach((item: Element) => {
        // Extract username from the conversation item
        const usernameEl = item.querySelector(
          '[data-testid="username"], .username, .sender-name, a[href*="/"]'
        );
        let username = usernameEl?.textContent?.trim() || '';

        // Try to extract from href if not found
        if (!username) {
          const link = item.querySelector('a[href*="/messages/"]');
          const href = link?.getAttribute('href') || '';
          const match = href.match(/\/messages\/([^\/]+)/);
          if (match) username = match[1];
        }

        // Get last message preview
        const previewEl = item.querySelector(
          '[data-testid="message-preview"], .message-preview, .last-message'
        );
        const lastMessagePreview = previewEl?.textContent?.trim() || '';

        // Get unread count
        const unreadEl = item.querySelector(
          '[data-testid="unread-count"], .unread-count, .badge'
        );
        const unreadText = unreadEl?.textContent?.trim() || '0';
        const unreadCount = parseInt(unreadText.replace(/\D/g, '')) || 0;

        if (username) {
          threadItems.push({ username, lastMessagePreview, unreadCount });
        }
      });

      return threadItems;
    });

    logger.info(`Found ${threads.length} DM threads`);
    return threads;
  }

  /**
   * Navigate to a specific thread and extract all messages
   */
  static async scrapeThread(
    page: Page,
    threadUsername: string,
    scrapeSessionId: string
  ): Promise<RawDMMessage[]> {
    const messages: RawDMMessage[] = [];

    // Navigate to the specific thread
    const threadUrl = `${this.MESSAGES_URL}${threadUsername}/`;
    await page.goto(threadUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for messages to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scroll to load all messages (messages may be lazy-loaded)
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    while (scrollAttempts < maxScrollAttempts) {
      // Get current message count
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll(
          '[data-testid="message-item"], .message-item, .message-bubble, .dm-message'
        ).length;
      });

      if (currentCount === previousCount) {
        // No new messages loaded, we've reached the top
        break;
      }

      previousCount = currentCount;

      // Scroll up to load more messages
      await page.evaluate(() => {
        const messageContainer = document.querySelector(
          '[data-testid="message-container"], .message-container, .messages-list'
        );
        if (messageContainer) {
          messageContainer.scrollTop = 0;
        } else {
          window.scrollTo(0, 0);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      scrollAttempts++;
    }

    // Extract all messages
    const rawMessages = await page.evaluate((threadUsername: string) => {
      const items: {
        messageText: string;
        isFromMe: boolean;
        rawDateText: string | null;
        dateHeaderText: string | null;
      }[] = [];

      // Track current date header for relative time computation
      let currentDateHeader: string | null = null;

      // Get all message elements and date headers in order
      const allElements = document.querySelectorAll(
        '[data-testid="message-item"], [data-testid="date-header"], .message-item, .message-bubble, .dm-message, .date-header, .message-date'
      );

      allElements.forEach((el: Element) => {
        // Check if this is a date header
        const isDateHeader = el.classList.contains('date-header') ||
          el.getAttribute('data-testid') === 'date-header' ||
          el.classList.contains('message-date');

        if (isDateHeader) {
          currentDateHeader = el.textContent?.trim() || null;
          return;
        }

        // This is a message
        const messageEl = el.querySelector('[data-testid="message-text"], .message-text, .message-content');
        const messageText = messageEl?.textContent?.trim() || el.textContent?.trim() || '';

        if (!messageText) return;

        // Determine if message is from me (sent) or from them (received)
        const isFromMe = el.classList.contains('sent') ||
          el.classList.contains('outgoing') ||
          el.classList.contains('from-me') ||
          el.getAttribute('data-direction') === 'sent' ||
          !!el.querySelector('.sent, .outgoing');

        // Get timestamp for this message
        const timeEl = el.querySelector('[data-testid="message-time"], .message-time, .timestamp, time');
        const rawDateText = timeEl?.textContent?.trim() || null;

        items.push({
          messageText,
          isFromMe,
          rawDateText,
          dateHeaderText: currentDateHeader,
        });
      });

      return items;
    }, threadUsername);

    // Process raw messages with date parsing
    let referenceDate: Date | null = null;

    for (const raw of rawMessages) {
      // Update reference date from date headers
      if (raw.dateHeaderText) {
        const parsedHeader = this.parseRelativeDate(raw.dateHeaderText, null);
        if (parsedHeader) {
          referenceDate = parsedHeader;
        }
      }

      // Compute timestamp using reference date
      const computedTimestamp = raw.rawDateText
        ? this.parseRelativeDate(raw.rawDateText, referenceDate)
        : referenceDate;

      // Parse tip information
      const { isTip, amount } = this.parseTipFromMessage(raw.messageText, raw.isFromMe);

      // Generate hash for deduplication
      const messageHash = this.generateMessageHash(
        threadUsername,
        raw.messageText,
        raw.rawDateText,
        raw.isFromMe
      );

      messages.push({
        threadUsername,
        messageText: raw.messageText,
        isFromMe: raw.isFromMe,
        rawDateText: raw.rawDateText,
        computedTimestamp,
        isTip,
        tipAmount: amount,
        tipNote: isTip ? raw.messageText : null,
        messageHash,
      });
    }

    logger.info(`Extracted ${messages.length} messages from thread ${threadUsername}`);
    return messages;
  }

  /**
   * Save raw DM messages to database
   */
  static async saveMessages(
    messages: RawDMMessage[],
    scrapeSessionId: string
  ): Promise<number> {
    let savedCount = 0;

    for (const msg of messages) {
      try {
        // Try to find person_id for the thread username
        let personId: string | null = null;
        try {
          const personResult = await query(
            `SELECT id FROM persons WHERE username = $1`,
            [msg.threadUsername]
          );
          if (personResult.rows.length > 0) {
            personId = personResult.rows[0].id;
          }
        } catch {
          // Person not found, that's OK
        }

        // Insert with ON CONFLICT to handle duplicates
        const result = await query(
          `INSERT INTO chaturbate_dm_raw_data (
            thread_username, message_text, is_from_me,
            raw_date_text, computed_timestamp,
            is_tip, tip_amount, tip_note,
            person_id, message_hash, scrape_session_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (message_hash) WHERE message_hash IS NOT NULL DO NOTHING
          RETURNING id`,
          [
            msg.threadUsername,
            msg.messageText,
            msg.isFromMe,
            msg.rawDateText,
            msg.computedTimestamp,
            msg.isTip,
            msg.tipAmount,
            msg.tipNote,
            personId,
            msg.messageHash,
            scrapeSessionId,
          ]
        );

        if (result.rows.length > 0) {
          savedCount++;
        }
      } catch (error) {
        logger.error('Error saving DM message', { error, msg });
      }
    }

    return savedCount;
  }

  /**
   * Update scrape state for a thread
   */
  static async updateScrapeState(
    threadUsername: string,
    messageCount: number,
    newestMessageHash: string | null
  ): Promise<void> {
    try {
      // Find person_id if exists
      let personId: string | null = null;
      const personResult = await query(
        `SELECT id FROM persons WHERE username = $1`,
        [threadUsername]
      );
      if (personResult.rows.length > 0) {
        personId = personResult.rows[0].id;
      }

      await query(
        `INSERT INTO dm_scrape_state (
          thread_username, person_id, is_scraped, last_scraped_at,
          message_count, newest_message_hash
        ) VALUES ($1, $2, true, NOW(), $3, $4)
        ON CONFLICT (thread_username) DO UPDATE SET
          person_id = COALESCE(EXCLUDED.person_id, dm_scrape_state.person_id),
          is_scraped = true,
          last_scraped_at = NOW(),
          message_count = EXCLUDED.message_count,
          newest_message_hash = EXCLUDED.newest_message_hash,
          updated_at = NOW()`,
        [threadUsername, personId, messageCount, newestMessageHash]
      );
    } catch (error) {
      logger.error('Error updating DM scrape state', { error, threadUsername });
    }
  }

  /**
   * Get threads that haven't been scraped yet
   */
  static async getUnscrapedThreads(): Promise<string[]> {
    const result = await query(
      `SELECT thread_username
       FROM dm_scrape_state
       WHERE is_scraped = false
       ORDER BY priority DESC, created_at ASC`
    );
    return result.rows.map(r => r.thread_username);
  }

  /**
   * Get raw DM data for display
   */
  static async getRawDMData(options: {
    limit?: number;
    offset?: number;
    threadUsername?: string;
    onlyTips?: boolean;
    onlyUnimported?: boolean;
  } = {}): Promise<{ rows: any[]; total: number }> {
    const { limit = 50, offset = 0, threadUsername, onlyTips, onlyUnimported } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (threadUsername) {
      conditions.push(`thread_username = $${paramIndex++}`);
      params.push(threadUsername);
    }

    if (onlyTips) {
      conditions.push('is_tip = true');
    }

    if (onlyUnimported) {
      conditions.push('imported_at IS NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM chaturbate_dm_raw_data ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataResult = await query(
      `SELECT
        d.*,
        p.username as person_username
       FROM chaturbate_dm_raw_data d
       LEFT JOIN persons p ON d.person_id = p.id
       ${whereClause}
       ORDER BY d.computed_timestamp DESC NULLS LAST, d.scraped_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return { rows: dataResult.rows, total };
  }

  /**
   * Import a raw DM as an interaction
   */
  static async importToInteraction(dmId: string): Promise<boolean> {
    try {
      // Get the DM data
      const dmResult = await query(
        `SELECT * FROM chaturbate_dm_raw_data WHERE id = $1`,
        [dmId]
      );

      if (dmResult.rows.length === 0) {
        logger.warn('DM not found for import', { dmId });
        return false;
      }

      const dm = dmResult.rows[0];

      // Find or create person
      let personId = dm.person_id;
      if (!personId) {
        const person = await PersonService.findOrCreate({
          username: dm.thread_username,
          role: 'VIEWER',
        });
        if (person) {
          personId = person.id;
        } else {
          logger.error('Could not find or create person for DM import', { username: dm.thread_username });
          return false;
        }
      }

      // Create the interaction
      const metadata: Record<string, any> = {
        isDM: true,
        broadcaster: '', // Empty = DM sent outside of any room
        importedFromDMScraper: true,
        rawDateText: dm.raw_date_text,
      };

      if (dm.is_tip) {
        metadata.tipAmount = Math.abs(dm.tip_amount);
        metadata.tipDirection = dm.tip_amount > 0 ? 'received' : 'sent';
      }

      const interactionResult = await query(
        `INSERT INTO interactions (
          person_id, type, content, timestamp, source, metadata
        ) VALUES ($1, $2, $3, $4, 'dm_import', $5)
        RETURNING id`,
        [
          personId,
          dm.is_tip ? 'TIP_EVENT' : 'DIRECT_MESSAGE',
          dm.message_text,
          dm.computed_timestamp || dm.scraped_at,
          JSON.stringify(metadata),
        ]
      );

      const interactionId = interactionResult.rows[0].id;

      // Update the DM record with import info
      await query(
        `UPDATE chaturbate_dm_raw_data
         SET imported_at = NOW(), interaction_id = $1, person_id = $2
         WHERE id = $3`,
        [interactionId, personId, dmId]
      );

      // If this is a tip, also check if we need to update existing TIP_EVENT
      if (dm.is_tip && dm.tip_amount > 0) {
        // Look for matching TIP_EVENT without a note
        const tipResult = await query(
          `SELECT id FROM interactions
           WHERE person_id = $1
             AND type = 'TIP_EVENT'
             AND (metadata->>'amount')::int = $2
             AND (metadata->>'tip_note' IS NULL OR metadata->>'tip_note' = '')
             AND timestamp BETWEEN $3 - INTERVAL '5 minutes' AND $3 + INTERVAL '5 minutes'
           LIMIT 1`,
          [personId, Math.abs(dm.tip_amount), dm.computed_timestamp || dm.scraped_at]
        );

        if (tipResult.rows.length > 0) {
          // Update existing tip with the note
          await query(
            `UPDATE interactions
             SET metadata = metadata || jsonb_build_object('tip_note', $1::text, 'dm_linked', true)
             WHERE id = $2`,
            [dm.tip_note || dm.message_text, tipResult.rows[0].id]
          );
        }
      }

      logger.info('Imported DM to interaction', { dmId, interactionId });
      return true;
    } catch (error) {
      logger.error('Error importing DM to interaction', { error, dmId });
      return false;
    }
  }

  /**
   * Bulk import all unimported DMs
   */
  static async importAllUnimported(): Promise<{ imported: number; failed: number }> {
    const result = await query(
      `SELECT id FROM chaturbate_dm_raw_data WHERE imported_at IS NULL`
    );

    let imported = 0;
    let failed = 0;

    for (const row of result.rows) {
      const success = await this.importToInteraction(row.id);
      if (success) {
        imported++;
      } else {
        failed++;
      }
    }

    return { imported, failed };
  }
}
