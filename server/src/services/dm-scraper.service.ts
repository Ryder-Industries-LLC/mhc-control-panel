// @ts-nocheck - Browser context code uses DOM APIs in page.evaluate
import { Page } from 'puppeteer';
import { ChaturbateScraperService } from './chaturbate-scraper.service.js';
import { PersonService } from './person.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
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
   * Includes topPosition to ensure identical messages at different positions are unique
   */
  private static generateMessageHash(
    threadUsername: string,
    messageText: string,
    rawDateText: string | null,
    isFromMe: boolean,
    topPosition: number
  ): string {
    const data = `${threadUsername}|${messageText}|${rawDateText || ''}|${isFromMe}|${topPosition}`;
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

    // CB shows times in user's local timezone (EST = UTC-5)
    // We need to compute "today" in EST, not UTC
    // EST offset is -5 hours (January is standard time, not daylight saving)
    const EST_OFFSET_MS = -5 * 60 * 60 * 1000;
    const nowUTC = new Date();
    // Get current time in EST by adjusting the UTC time
    // This gives us the correct day-of-week and date in EST
    const estTime = nowUTC.getTime() + EST_OFFSET_MS;
    const nowInEST = new Date(estTime);

    // For relative date calculations, we use EST day boundaries
    const now = nowInEST;
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
    // Per user rules: Day of week = CURRENT WEEK occurrence
    // If today is Sunday (0), we go back to get this week's occurrence of any day
    const dayTimeMatch = text.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (dayTimeMatch) {
      const time = parseTime(dayTimeMatch[2]);
      if (time) {
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
          // Find the CURRENT WEEK occurrence of this day
          // If today is Saturday (6) and we want Saturday (6): daysBack = 0
          // If today is Saturday (6) and we want Friday (5): daysBack = 1
          // If today is Saturday (6) and we want Sunday (0): daysBack = 6 (last Sunday, start of this week)
          let daysBack = currentDay - targetDay;
          if (daysBack < 0) daysBack += 7; // Go back to previous occurrence in current week
          result.setDate(result.getDate() - daysBack);
          result.setHours(time.hour, time.minute, 0, 0);
          return result;
        }
      }
    }

    // Just a time: "7:30pm" - use referenceDate if available, otherwise today
    // CB shows just a time when the message is on the same day as the preceding message
    // The referenceDate comes from the most recent date header or day-of-week timestamp
    const justTimeMatch = text.match(/^(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i);
    if (justTimeMatch) {
      const time = parseTime(justTimeMatch[1]);
      if (time) {
        // Use referenceDate if we have one (from a previous date header or "Sun 4:25am" style timestamp)
        // Otherwise fall back to today
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
   * Dismiss upgrade notice dialog if present
   */
  static async dismissUpgradeNotice(page: Page): Promise<boolean> {
    try {
      const dismissed = await page.evaluate(() => {
        // Look for "Got it" button from the upgrade notice
        const buttons = document.querySelectorAll('button, a');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase().trim() || '';
          if (text === 'got it' || text === 'okay' || text === 'ok' || text === 'dismiss') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (dismissed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.info('Dismissed upgrade notice dialog');
      }
      return dismissed;
    } catch {
      return false;
    }
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

    // Dismiss upgrade notice if present
    await this.dismissUpgradeNotice(page);

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

    // Extract thread list - parse from the visible UI
    // The page shows threads as clickable items with usernames
    const threads = await page.evaluate(() => {
      const threadItems: { username: string; lastMessagePreview: string; unreadCount: number }[] = [];

      // The body text showed format like:
      // Z zackconnorsx Yesterday thx for vote
      // T tylercarter96 Yesterday See U later
      // Look for links that go to /messages/username/
      const links = document.querySelectorAll('a[href*="/messages/"]');

      links.forEach((link: Element) => {
        const href = link.getAttribute('href') || '';
        // Match /messages/username/ pattern but not /messages/ alone
        const match = href.match(/\/messages\/([a-z0-9_]+)\/?$/i);
        if (match && match[1]) {
          const username = match[1];
          // Avoid duplicates
          if (!threadItems.some(t => t.username === username)) {
            // Try to get preview text from parent container
            const container = link.closest('div');
            const allText = container?.textContent || '';
            threadItems.push({
              username,
              lastMessagePreview: allText.substring(0, 100),
              unreadCount: 0,
            });
          }
        }
      });

      // If that didn't work, try parsing the body text for usernames
      if (threadItems.length === 0) {
        // Look for any element that looks like a username link
        const allDivs = document.querySelectorAll('div');
        allDivs.forEach((div: Element) => {
          const text = div.textContent?.trim() || '';
          // Look for patterns like single letter avatar + username
          const match = text.match(/^([A-Z])\s+([a-z0-9_]+)\s+(Yesterday|Today|[A-Z][a-z]+ \d)/);
          if (match && match[2]) {
            const username = match[2];
            if (!threadItems.some(t => t.username === username) && username.length > 2) {
              threadItems.push({
                username,
                lastMessagePreview: text.substring(0, 100),
                unreadCount: 0,
              });
            }
          }
        });
      }

      return threadItems;
    });

    logger.info(`Found ${threads.length} DM threads`);
    return threads;
  }

  /**
   * Scroll up in the message container to load older messages
   * CB DMs lazy-load older messages as you scroll up
   * Keep scrolling until we see "Start of conversation" text
   */
  static async scrollToLoadOlderMessages(page: Page, maxScrolls: number = 10): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      // Check if we've reached the start of conversation
      const reachedStart = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        return bodyText.includes('Start of conversation');
      });

      if (reachedStart) {
        logger.info('Reached "Start of conversation" - doing final scroll and wait');
        // Do one more scroll to ensure we're at the absolute top
        await page.evaluate(() => {
          const messageRow = document.querySelector('.message-row');
          if (messageRow) {
            let container: HTMLElement | null = messageRow.parentElement;
            while (container) {
              const style = window.getComputedStyle(container);
              const isScrollable =
                (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                container.scrollHeight > container.clientHeight;
              if (isScrollable) {
                container.scrollTop = 0;
                break;
              }
              container = container.parentElement;
            }
          }
        });
        // Wait extra time for messages to render after reaching the top
        await new Promise(resolve => setTimeout(resolve, 3000));
        break;
      }

      const scrolled = await page.evaluate(() => {
        // Find the messages container - look for scrollable parent of message rows
        const messageRow = document.querySelector('.message-row');
        if (!messageRow) return false;

        // Walk up to find the scrollable container
        let container: HTMLElement | null = messageRow.parentElement;
        while (container) {
          const style = window.getComputedStyle(container);
          const isScrollable =
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            container.scrollHeight > container.clientHeight;
          if (isScrollable) break;
          container = container.parentElement;
        }

        if (!container) {
          // Try common container selectors
          container = document.querySelector('[class*="message-list"]') as HTMLElement ||
            document.querySelector('[class*="chat-container"]') as HTMLElement ||
            document.querySelector('[class*="conversation"]') as HTMLElement;
        }

        if (container) {
          const previousScrollTop = container.scrollTop;
          container.scrollTop = 0; // Scroll to top
          return previousScrollTop > 0; // Return true if we actually scrolled
        }

        return false;
      });

      if (scrolled) {
        // Wait for new messages to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        logger.info(`Scrolled up to load older messages (scroll ${i + 1}/${maxScrolls})`);
      } else {
        // No more scrolling possible - might already be at top
        logger.info('No more scroll possible, checking if at start');
        break;
      }
    }
  }

  /**
   * Extract currently visible messages from the page
   * This is called multiple times (after scroll to top, after scroll to bottom)
   * to capture all messages despite CB's lazy-loading behavior
   */
  static async extractVisibleMessages(
    page: Page,
    threadUsername: string
  ): Promise<{
    messageText: string;
    isFromMe: boolean;
    rawDateText: string | null;
    dateHeaderText: string | null;
    topPosition: number;
  }[]> {
    return await page.evaluate((threadUsername: string) => {
      const items: {
        messageText: string;
        isFromMe: boolean;
        rawDateText: string | null;
        dateHeaderText: string | null;
        topPosition: number;
      }[] = [];

      // Text patterns that should be filtered out (navigation, headers, warnings)
      const skipPatterns = [
        /^start of conversation$/i,
        /^private conversation with/i,
        /^messages$/i,
        /^all$/i,
        /^unread$/i,
        /^home$/i,
        /^discover$/i,
        /^broadcast$/i,
        /^tokens$/i,
        /^get more/i,
        /^type a message/i,
        /^send$/i,
        /^settings$/i,
        /^block$/i,
        /^report$/i,
        /^mute$/i,
        /^direct messages got an upgrade/i,
        /^enjoy a modern look/i,
        /^got it$/i,
        /^okay$/i,
        /^dismiss$/i,
        /chaturbate/i,
        /^today$/i,
        /^yesterday$/i,
        /^[a-z]+ \d{1,2},? \d{4}$/i,  // Date headers like "January 4, 2026"
        /^\d{1,2}:\d{2}\s*(am|pm)?$/i,  // Just time
        /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i,  // Just day name
      ];

      const shouldSkip = (text: string): boolean => {
        const trimmed = text.trim();
        if (trimmed.length < 2 || trimmed.length > 1000) return true;
        for (const pattern of skipPatterns) {
          if (pattern.test(trimmed)) return true;
        }
        return false;
      };

      const cbSelectors = [
        '.message-row',
        '[class*="message-row"]',
        '.message-bubble',
        '[class*="message-bubble"]',
        '.dm-message',
        '[class*="dm-message"]',
      ];

      interface DOMElement {
        type: 'date' | 'message';
        element: Element;
        date?: string;
        topPosition: number;
      }
      const allElements: DOMElement[] = [];

      // Helper to extract top position from inline style
      const getTopPosition = (el: Element): number => {
        const style = el.getAttribute('style') || '';
        const topMatch = style.match(/top:\s*(\d+)px/);
        return topMatch ? parseInt(topMatch[1], 10) : 0;
      };

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );

      const messageRowSet = new Set<Element>();
      const dateHeaderSet = new Set<Element>();

      // Look for date headers - precise selector first
      document.querySelectorAll('[data-testid="message-timestamp-value"]').forEach((el: Element) => {
        const text = (el.textContent || '').trim();
        const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/i);
        if (dateMatch) {
          const parentTimestamp = el.closest('.message-row-timestamp, [class*="message-row-timestamp"]');
          if (parentTimestamp) {
            dateHeaderSet.add(parentTimestamp);
          } else {
            dateHeaderSet.add(el);
          }
        }
      });

      // Fallback for date headers
      if (dateHeaderSet.size === 0) {
        document.querySelectorAll('.message-row-timestamp, [class*="message-row-timestamp"]').forEach((el: Element) => {
          const text = (el.textContent || '').trim();
          const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/i);
          if (dateMatch) {
            dateHeaderSet.add(el);
          }
        });
      }

      for (const selector of cbSelectors) {
        document.querySelectorAll(selector).forEach((el: Element) => {
          const rowClasses = (el.className || '').toLowerCase();
          if (!rowClasses.includes('timestamp')) {
            messageRowSet.add(el);
          }
        });
        if (messageRowSet.size > 0) break;
      }

      // Instead of using tree walker order, directly process message rows
      // and get their top position from the style attribute
      // This ensures correct ordering based on CB's virtual list positioning

      // Process all message rows directly - the order doesn't matter because we'll sort by topPosition
      for (const row of messageRowSet) {
        const topPos = getTopPosition(row);

        // Extract timestamp if present (can be full date, day+time, or just time)
        let timestampText: string | null = null;
        const timestampEl = row.querySelector('[data-testid="message-timestamp-value"]');
        if (timestampEl) {
          timestampText = (timestampEl.textContent || '').trim();
        }

        // Add as message element with timestamp info embedded
        allElements.push({
          type: 'message',
          element: row,
          date: timestampText || undefined,  // Store timestamp for later processing
          topPosition: topPos,
        });
      }

      // Sort by topPosition to get correct message order
      allElements.sort((a, b) => a.topPosition - b.topPosition);

      const rowHasAvatar = (row: Element): boolean => {
        const children = Array.from(row.children);
        for (const child of children) {
          const childText = (child.textContent || '').trim();
          const childClass = (child.className || '').toLowerCase();
          if (childText.length === 1 && /^[A-Z]$/.test(childText)) {
            return true;
          }
          if (childClass.includes('avatar')) {
            return true;
          }
        }
        return false;
      };

      // Track the last full date header (e.g., "March 29, 2025") for date context
      // Track the last timestamp of any kind (full date, day+time, or time) for messages without timestamps
      let currentDateHeader: string | null = null;
      let lastTimestamp: string | null = null;

      for (const item of allElements) {
        const row = item.element;
        const sentMessageEl = row.querySelector('[data-testid="sent-message"]');
        const receivedMessageEl = row.querySelector('[data-testid="received-message"]');

        // Use the specific message element text if available, otherwise use row text
        // This handles cases where the first message row also contains header text
        let rawRowText: string;
        if (sentMessageEl) {
          rawRowText = (sentMessageEl.textContent || '').trim();
        } else if (receivedMessageEl) {
          rawRowText = (receivedMessageEl.textContent || '').trim();
        } else {
          rawRowText = (row.textContent || '').trim();
          // Skip header/system rows only if there's no specific message element
          if (rawRowText.includes('Private conversation with')) continue;
          if (rawRowText.includes('Chaturbate Team will NEVER')) continue;
          if (/^Start of conversation/i.test(rawRowText)) continue;
        }

        const rowClasses = (row.className || '').toLowerCase();
        const allClasses = rowClasses + ' ' + (row.parentElement?.className || '').toLowerCase();
        const hasOutgoingClass =
          allClasses.includes('sent') ||
          allClasses.includes('outgoing') ||
          allClasses.includes('own') ||
          allClasses.includes('self') ||
          allClasses.includes('from-me') ||
          allClasses.includes('mine');

        const hasIncomingClass =
          allClasses.includes('received') ||
          allClasses.includes('incoming') ||
          allClasses.includes('other') ||
          allClasses.includes('from-them');

        const style = window.getComputedStyle(row);
        const parentStyle = row.parentElement ? window.getComputedStyle(row.parentElement) : null;
        const isAlignedRight =
          style.justifyContent === 'flex-end' ||
          style.alignSelf === 'flex-end' ||
          style.marginLeft === 'auto' ||
          (parentStyle && parentStyle.justifyContent === 'flex-end');

        // Use timestamp from the DOM element (extracted earlier)
        // This is the authoritative source - directly from [data-testid="message-timestamp-value"]
        const domTimestamp = item.date || null;

        // Update trackers based on timestamp type
        if (domTimestamp) {
          // Always track the last timestamp we saw (any type)
          lastTimestamp = domTimestamp;

          // Update full date header only for full calendar dates
          const fullDateMatch = domTimestamp.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/i);
          if (fullDateMatch) {
            currentDateHeader = fullDateMatch[0];
          }
        }

        // Determine rawDateText: use DOM timestamp if present
        // If no DOM timestamp, inherit the LAST timestamp (which preserves "Sun 4:44pm" style)
        let rawDateText: string | null = domTimestamp || lastTimestamp;

        const hasAvatarInDOM = rowHasAvatar(row);
        const expectedAvatarLetter = threadUsername.charAt(0).toUpperCase();

        let hasAvatarPrefix = false;
        let messageText: string = rawRowText;

        // Check for avatar letter prefix on received messages
        // The avatar letter appears when CB shows the profile picture initial before the message
        if (receivedMessageEl || (!sentMessageEl && !receivedMessageEl)) {
          const firstChar = rawRowText.charAt(0);
          const secondChar = rawRowText.charAt(1);
          if (firstChar === expectedAvatarLetter) {
            const isSecondCharLetter = (secondChar >= 'a' && secondChar <= 'z') ||
                                       (secondChar >= 'A' && secondChar <= 'Z');
            const isSecondCharEmoji = secondChar && secondChar.charCodeAt(0) > 127;

            if (secondChar >= 'a' && secondChar <= 'z') {
              hasAvatarPrefix = true;
              messageText = rawRowText.substring(1).trim();
            } else if (secondChar === 'I' && rawRowText.length > 2) {
              const thirdChar = rawRowText.charAt(2);
              if (thirdChar === ' ' || thirdChar === '\'' || (thirdChar >= 'a' && thirdChar <= 'z')) {
                hasAvatarPrefix = true;
                messageText = rawRowText.substring(1).trim();
              }
            } else if (secondChar >= 'A' && secondChar <= 'Z' && rawRowText.length > 2) {
              const thirdChar = rawRowText.charAt(2);
              if (thirdChar >= 'a' && thirdChar <= 'z') {
                hasAvatarPrefix = true;
                messageText = rawRowText.substring(1).trim();
              }
            } else if (isSecondCharEmoji || !isSecondCharLetter) {
              hasAvatarPrefix = true;
              messageText = rawRowText.substring(1).trim();
            }
          }

          // Check for avatar with space: "Z message text"
          const avatarWithSpaceMatch = rawRowText.match(/^([A-Z])\s+(.)/);
          if (
            !hasAvatarPrefix &&
            avatarWithSpaceMatch &&
            avatarWithSpaceMatch[1] === expectedAvatarLetter
          ) {
            hasAvatarPrefix = true;
            messageText = rawRowText.substring(2).trim();
          }
        }

        if (shouldSkip(messageText)) continue;

        let isFromMe: boolean;

        if (sentMessageEl) {
          isFromMe = true;
        } else if (receivedMessageEl) {
          isFromMe = false;
        } else if (hasAvatarInDOM || hasAvatarPrefix) {
          isFromMe = false;
        } else if (hasOutgoingClass) {
          isFromMe = true;
        } else if (hasIncomingClass) {
          isFromMe = false;
        } else if (isAlignedRight) {
          isFromMe = true;
        } else {
          isFromMe = true;
        }

        items.push({
          messageText: messageText,
          isFromMe,
          rawDateText,
          dateHeaderText: currentDateHeader,
          topPosition: item.topPosition,
        });
      }

      // Forward-fill dates: CB puts date headers on the FIRST message of each day
      // So messages without timestamps belong to the PREVIOUS day's date header
      // We iterate forwards so each message inherits from prior messages
      let lastKnownDateHeader: string | null = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].dateHeaderText) {
          // This message has a date header - it starts a new day
          lastKnownDateHeader = items[i].dateHeaderText;
        } else if (lastKnownDateHeader) {
          // No date header - inherit from the previous day
          items[i].dateHeaderText = lastKnownDateHeader;
          // Also fill rawDateText if it's missing
          if (!items[i].rawDateText) {
            items[i].rawDateText = lastKnownDateHeader;
          }
        }
      }

      // Return all items - deduplication happens later by topPosition in scrapeThread()
      // We don't dedup by message text here because identical messages at different
      // positions are valid (e.g., two "appreciate it" messages on different days)
      return items;
    }, threadUsername);
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

    // Navigate to the messages page first
    logger.info(`Navigating to messages page for: ${threadUsername}`);
    await page.goto(this.MESSAGES_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Dismiss upgrade notice if present
    await this.dismissUpgradeNotice(page);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click on the specific thread by finding the link
    const clickedThread = await page.evaluate((username: string) => {
      const targetUsername = username.toLowerCase();

      // Method 1: Find link with href containing /messages/username
      const links = document.querySelectorAll('a[href*="/messages/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.toLowerCase().includes(`/messages/${targetUsername}`)) {
          (link as HTMLElement).click();
          return 'link';
        }
      }

      // Method 2: Find thread list item by username text
      // CB thread list shows: Avatar initial + username + time + preview
      // Look for elements with class containing 'thread' or 'conversation'
      const threadSelectors = [
        '[class*="conversationListItem"]',
        '[class*="thread-item"]',
        '[class*="message-thread"]',
        '[class*="dm-thread"]',
        'div[role="listitem"]',
        'div[role="option"]',
      ];

      for (const selector of threadSelectors) {
        const items = document.querySelectorAll(selector);
        for (const item of items) {
          const text = (item.textContent || '').toLowerCase();
          // Check if this thread item contains the target username
          // The text might be like "Z zackconnorsx 12:58 am 😈" or just "zackconnorsx"
          if (text.includes(targetUsername)) {
            (item as HTMLElement).click();
            return 'thread-item';
          }
        }
      }

      // Method 3: Find any clickable element containing just the username
      // Look for username as link text or in a clickable container
      const allDivs = document.querySelectorAll('div, span, a, button');
      for (const el of allDivs) {
        // Get only direct text content (not nested)
        let directText = '';
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            directText += (child.textContent || '');
          }
        }
        directText = directText.trim().toLowerCase();

        // Also check the full text for exact username match
        const fullText = (el.textContent || '').trim().toLowerCase();

        // Match if element directly contains username or is the username
        if (directText === targetUsername || directText.includes(targetUsername)) {
          // Find clickable parent or click the element
          const clickable = el.closest('[role="button"], a, button') || el;
          (clickable as HTMLElement).click();
          return 'direct-text';
        }

        // Try matching pattern like "T username" (avatar initial + username)
        const avatarPattern = new RegExp(`^[a-z]\\s+${targetUsername}`, 'i');
        if (avatarPattern.test(fullText) || fullText.startsWith(targetUsername + ' ')) {
          (el as HTMLElement).click();
          return 'avatar-pattern';
        }
      }

      // Method 4: Search for a link that might be inside a thread container
      // Sometimes the username is in a child span/div inside a clickable parent
      const usernameElements = Array.from(document.querySelectorAll('*')).filter((el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === targetUsername && el.children.length === 0; // Leaf node with exact match
      });

      for (const el of usernameElements) {
        // Click the nearest clickable ancestor
        const clickable = (el as Element).closest('div[class*="thread"], div[class*="conversation"], div[class*="list"], a') as HTMLElement;
        if (clickable) {
          clickable.click();
          return 'ancestor-click';
        } else {
          // Click the element's parent
          (el.parentElement as HTMLElement)?.click();
          return 'parent-click';
        }
      }

      return false;
    }, threadUsername);

    if (!clickedThread) {
      logger.warn(`Could not find thread for ${threadUsername} in thread list`);
      // Direct URL navigation doesn't work for CB DMs (redirects to profile)
      // Return empty array - user needs to scroll to find this thread in their list
      logger.warn(`Thread ${threadUsername} not visible in current thread list - try scrolling the thread list first`);
      return messages;
    } else {
      logger.info(`Clicked thread for ${threadUsername} using method: ${clickedThread}`);
    }

    // Wait for messages panel to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // TWO-PASS EXTRACTION STRATEGY:
    // CB lazy-loads messages and unloads messages at the opposite end when scrolling.
    // To capture ALL messages, we:
    // 1. Scroll to top (loads oldest messages, may unload newest)
    // 2. Extract messages at top (FIRST PASS - captures oldest)
    // 3. Scroll to bottom (loads newest messages, may unload oldest)
    // 4. Extract messages at bottom (SECOND PASS - captures newest)
    // 5. Merge and deduplicate both passes

    // FIRST PASS: Scroll to top to load ALL older messages
    await this.scrollToLoadOlderMessages(page);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract messages at the TOP (oldest messages visible now)
    const firstPassMessages = await this.extractVisibleMessages(page, threadUsername);
    logger.info(`First pass (after scroll to top): found ${firstPassMessages.length} messages`);

    // SECOND PASS: Scroll back to bottom to ensure newest messages are loaded
    // CB shows a "Scroll to bottom" button if there are messages below current view
    const scrolledToBottom = await page.evaluate(() => {
      // Try to click "Scroll to bottom" button if present
      const buttons = document.querySelectorAll('button, div[role="button"], span, a');
      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase().trim();
        if (text === 'scroll to bottom' || text.includes('scroll to bottom')) {
          (btn as HTMLElement).click();
          return 'clicked-button';
        }
      }

      // Also scroll the message container to the bottom
      const messageRow = document.querySelector('.message-row');
      if (messageRow) {
        let container: HTMLElement | null = messageRow.parentElement;
        while (container) {
          const style = window.getComputedStyle(container);
          const isScrollable =
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            container.scrollHeight > container.clientHeight;
          if (isScrollable) {
            container.scrollTop = container.scrollHeight;
            return 'scrolled-container';
          }
          container = container.parentElement;
        }
      }
      return false;
    });

    if (scrolledToBottom) {
      logger.info(`Scrolled to bottom: ${scrolledToBottom}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Extract messages at the BOTTOM (newest messages visible now)
    const secondPassMessages = await this.extractVisibleMessages(page, threadUsername);
    logger.info(`Second pass (after scroll to bottom): found ${secondPassMessages.length} messages`);

    // MERGE: Combine both passes and deduplicate by topPosition
    // topPosition is unique per message in CB's virtual list, so it's the best dedup key
    // This allows identical message text to appear multiple times (e.g., "appreciate it" twice)
    const seenMessages = new Map<string, typeof firstPassMessages[0]>();

    // Add first pass messages (oldest)
    for (const msg of firstPassMessages) {
      const key = String(msg.topPosition);
      if (!seenMessages.has(key)) {
        seenMessages.set(key, msg);
      }
    }

    // Add second pass messages (newest) - only if not already seen
    for (const msg of secondPassMessages) {
      const key = String(msg.topPosition);
      if (!seenMessages.has(key)) {
        seenMessages.set(key, msg);
      }
    }

    // Convert back to array and sort by topPosition (ascending = oldest to newest)
    const rawMessages = Array.from(seenMessages.values()).sort((a, b) => a.topPosition - b.topPosition);
    logger.info(`Merged passes: ${rawMessages.length} unique messages (${firstPassMessages.length} + ${secondPassMessages.length} with dedup)`);

    // NOTE: Debug info collection removed - extraction now happens in extractVisibleMessages()
    // The old inline extraction code has been moved to the extractVisibleMessages() method above


    // Process raw messages with date parsing
    // The dateHeaderText contains the most recent date header (e.g., "January 4, 2026")
    // The rawDateText may be a time-only string (e.g., "Fri 12:30am") that needs the date context
    let lastDateHeader: Date | null = null;

    for (const raw of rawMessages) {
      // Update reference date from the date header for this message
      if (raw.dateHeaderText) {
        const parsedHeader = this.parseRelativeDate(raw.dateHeaderText, null);
        if (parsedHeader) {
          lastDateHeader = parsedHeader;
        }
      }

      // Compute timestamp:
      // - If rawDateText is a full date (e.g., "January 4, 2026"), parse it directly
      // - If rawDateText is a relative time (e.g., "Fri 12:30am" or "Sun 4:25am"), use lastDateHeader as reference
      // - If rawDateText is just time (e.g., "12:57am"), use lastDateHeader (same day as previous message)
      // - If no rawDateText, use lastDateHeader as fallback
      let computedTimestamp: Date | null = null;

      if (raw.rawDateText) {
        computedTimestamp = this.parseRelativeDate(raw.rawDateText, lastDateHeader);
        // Update lastDateHeader for subsequent messages that might have just a time
        // This ensures "12:57am" uses the date from "Sun 4:25am"
        if (computedTimestamp) {
          lastDateHeader = computedTimestamp;
        }
      } else if (lastDateHeader) {
        // No timestamp on message, use the date header
        computedTimestamp = new Date(lastDateHeader);
      }

      // Parse tip information
      const { isTip, amount } = this.parseTipFromMessage(raw.messageText, raw.isFromMe);

      // Generate hash for deduplication
      const messageHash = this.generateMessageHash(
        threadUsername,
        raw.messageText,
        raw.rawDateText,
        raw.isFromMe,
        raw.topPosition
      );

      // Store both the raw date text and the dateHeaderText for debugging
      const effectiveRawDateText = raw.rawDateText || raw.dateHeaderText;

      messages.push({
        threadUsername,
        messageText: raw.messageText,
        isFromMe: raw.isFromMe,
        rawDateText: effectiveRawDateText,
        computedTimestamp,
        isTip,
        tipAmount: amount,
        tipNote: isTip ? raw.messageText : null,
        messageHash,
      });
    }

    // Post-processing: Fix "just time" messages
    // CB shows just a time (e.g., "12:57am") when the message is on the same day as another message.
    // Look for a message with a day-of-week pattern (like "Sun 4:25am") anywhere in the array
    // that would logically be the same day as this "just time" message.
    const justTimePattern = /^\d{1,2}:\d{2}\s*(am|pm)?$/i;
    const hasDayOfWeekPattern = /^(mon|tue|wed|thu|fri|sat|sun)/i;

    // Find the most recent day-of-week message (like "Sun 4:25am") in the entire list
    // This gives us the "current day" reference for any "just time" messages
    let dayOfWeekReference: Date | null = null;
    for (const msg of messages) {
      if (msg.rawDateText && hasDayOfWeekPattern.test(msg.rawDateText.trim()) && msg.computedTimestamp) {
        // Take the LATEST day-of-week timestamp as the reference (most recent in conversation)
        if (!dayOfWeekReference || msg.computedTimestamp.getTime() > dayOfWeekReference.getTime()) {
          dayOfWeekReference = msg.computedTimestamp;
        }
      }
    }

    // Apply the day-of-week reference to all "just time" messages
    for (const msg of messages) {
      if (msg.rawDateText && justTimePattern.test(msg.rawDateText.trim())) {
        if (dayOfWeekReference) {
          // Use the day-of-week date as reference
          const correctedTimestamp = this.parseRelativeDate(msg.rawDateText, dayOfWeekReference);
          if (correctedTimestamp) {
            msg.computedTimestamp = correctedTimestamp;
          }
        }
      }
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
    const broadcasterUsername = env.CHATURBATE_USERNAME;

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

        // Get thread_id from dm_scrape_state
        let threadId: string | null = null;
        try {
          const threadResult = await query(
            `SELECT id FROM dm_scrape_state WHERE thread_username = $1`,
            [msg.threadUsername]
          );
          if (threadResult.rows.length > 0) {
            threadId = threadResult.rows[0].id;
          }
        } catch {
          // Thread not found, that's OK
        }

        // Determine from/to based on is_from_me
        const fromUsername = msg.isFromMe ? broadcasterUsername : msg.threadUsername;
        const toUsername = msg.isFromMe ? msg.threadUsername : broadcasterUsername;

        // Insert with ON CONFLICT to handle duplicates
        const result = await query(
          `INSERT INTO chaturbate_dm_raw_data (
            thread_username, message_text, is_from_me,
            raw_date_text, computed_timestamp,
            is_tip, tip_amount, tip_note,
            person_id, message_hash, scrape_session_id,
            from_username, to_username, thread_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            fromUsername,
            toUsername,
            threadId,
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

  /**
   * Get scrape queue - list of threads with scrape state
   */
  static async getScrapeQueue(options: {
    limit?: number;
    offset?: number;
    showScraped?: boolean;
  } = {}): Promise<{ rows: any[]; total: number; stats: { total: number; scraped: number; pending: number } }> {
    const { limit = 50, offset = 0, showScraped = true } = options;

    // Get stats first
    const statsResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_scraped = true) as scraped,
        COUNT(*) FILTER (WHERE is_scraped = false) as pending
       FROM dm_scrape_state`
    );
    const stats = {
      total: parseInt(statsResult.rows[0].total) || 0,
      scraped: parseInt(statsResult.rows[0].scraped) || 0,
      pending: parseInt(statsResult.rows[0].pending) || 0,
    };

    // Build conditions
    const conditions: string[] = [];
    if (!showScraped) {
      conditions.push('is_scraped = false');
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) as count FROM dm_scrape_state ${whereClause}`
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataResult = await query(
      `SELECT
        s.*,
        p.username as person_username,
        (SELECT COUNT(*) FROM chaturbate_dm_raw_data d WHERE d.thread_username = s.thread_username) as raw_message_count,
        (SELECT COUNT(*) FROM chaturbate_dm_raw_data d WHERE d.thread_username = s.thread_username AND d.imported_at IS NULL) as unimported_count
       FROM dm_scrape_state s
       LEFT JOIN persons p ON s.person_id = p.id
       ${whereClause}
       ORDER BY s.is_scraped ASC, s.priority DESC, s.last_scraped_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { rows: dataResult.rows, total, stats };
  }

  /**
   * Add threads to scrape queue (discovered from thread list)
   */
  static async addToScrapeQueue(threads: DMThread[]): Promise<number> {
    let added = 0;

    for (const thread of threads) {
      try {
        // Find person_id if exists
        let personId: string | null = null;
        const personResult = await query(
          `SELECT id FROM persons WHERE username = $1`,
          [thread.username]
        );
        if (personResult.rows.length > 0) {
          personId = personResult.rows[0].id;
        }

        const result = await query(
          `INSERT INTO dm_scrape_state (thread_username, person_id, is_scraped, priority)
           VALUES ($1, $2, false, $3)
           ON CONFLICT (thread_username) DO NOTHING
           RETURNING id`,
          [thread.username, personId, thread.unreadCount > 0 ? 10 : 0]
        );

        if (result.rows.length > 0) {
          added++;
        }
      } catch (error) {
        logger.error('Error adding thread to scrape queue', { error, thread });
      }
    }

    return added;
  }
}
