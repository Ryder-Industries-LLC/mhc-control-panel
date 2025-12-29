/**
 * Transcript Parser Service
 *
 * Parses Chaturbate chat transcripts into structured data for AI summary generation.
 * Handles user joins/leaves, tips, room subject changes, follows/unfollows, and chat messages.
 */

export interface Visitor {
  username: string;
  joinTime: Date;
  leaveTime?: Date;
  durationSeconds?: number;
}

export interface Tip {
  username: string;
  tokens: number;
  note?: string;
  timestamp?: Date;
}

export interface ChatMessage {
  username: string;
  message: string;
  isHudson: boolean;
}

export interface TopLover {
  rank: number;
  username: string;
  tokens: number;
}

export interface ParsedTranscript {
  roomSubjects: string[];
  tips: Tip[];
  visitors: Visitor[];
  follows: string[];
  unfollows: string[];
  chatMessages: ChatMessage[];
  privateMessageUsers: string[];
  knownStreamers: string[];
  topLoversBoard: TopLover[];
  totalTokens: number;
  uniqueUsernames: string[];
  // Raw lines for GPT - chat messages + tip notices + top lovers notices
  filteredChatLines: string[];
}

export interface VisitorCategories {
  stayed: string[];
  quick: string[];
}

// Patterns for parsing transcript lines
const PATTERNS = {
  // User X has joined the room.
  userJoin: /^User (\S+) has joined the room/,
  // User X has left the room.
  userLeave: /^User (\S+) has left the room/,
  // username tipped X tokens
  tip: /^(\S+) tipped (\d+) tokens?$/,
  // Notice: username tipped for » tip menu item
  tipNote: /^Notice: (\S+) tipped for » (.+)$/,
  // room subject changed to "..."
  roomSubject: /^room subject changed to "(.+)"$/,
  // Notice: ⭐ @username has followed you
  follow: /@(\S+) has followed you/,
  // Notice: @username has unfollowed you
  unfollow: /@(\S+) has unfollowed you/,
  // Notice: 1. username (1234 tks)
  topLover: /^Notice: (\d+)\. (\S+) \((\d+) tks?\)/,
  // New private message from username
  privateMessage: /^New private message from (\S+)/,
  // *** Warning *** A Male User @username is currently broadcasting!!
  broadcasterWarning: /\*\*\* Warning \*\*\* A \w+ User @(\S+) is currently broadcasting/,
  // Chat messages: usernameMessage (no space between username and message)
  // This is tricky - username is attached to message without separator
  chatMessage: /^([a-z0-9_]+[a-z0-9])([A-Z@:!?'".,].*)$/i,
};

// Usernames to exclude from all stats/lists
const EXCLUDED_USERNAMES = ['smk_lover'];

class TranscriptParserService {
  /**
   * Parse a raw transcript string into structured data
   */
  parse(transcript: string): ParsedTranscript {
    const lines = transcript.split('\n').filter((line) => line.trim());

    const result: ParsedTranscript = {
      roomSubjects: [],
      tips: [],
      visitors: [],
      follows: [],
      unfollows: [],
      chatMessages: [],
      privateMessageUsers: [],
      knownStreamers: [],
      topLoversBoard: [],
      totalTokens: 0,
      uniqueUsernames: [],
      filteredChatLines: [],
    };

    // Track visitor sessions
    const visitorSessions: Map<string, Visitor> = new Map();
    const topLoversMap: Map<string, TopLover> = new Map();
    const uniqueUsers: Set<string> = new Set();
    const knownStreamersSet: Set<string> = new Set();
    let lineIndex = 0;

    for (const line of lines) {
      lineIndex++;
      const trimmedLine = line.trim();

      // Skip empty lines and certain notices
      if (!trimmedLine || this.isIgnorableLine(trimmedLine)) {
        continue;
      }

      // User join
      const joinMatch = trimmedLine.match(PATTERNS.userJoin);
      if (joinMatch) {
        const username = joinMatch[1];
        if (!this.isExcluded(username)) {
          uniqueUsers.add(username);
          // Start a new session for this user
          visitorSessions.set(username, {
            username,
            joinTime: new Date(), // We don't have timestamps in transcript
          });
        }
        continue;
      }

      // User leave
      const leaveMatch = trimmedLine.match(PATTERNS.userLeave);
      if (leaveMatch) {
        const username = leaveMatch[1];
        if (!this.isExcluded(username)) {
          const session = visitorSessions.get(username);
          if (session) {
            session.leaveTime = new Date();
            result.visitors.push({ ...session });
            visitorSessions.delete(username);
          }
        }
        continue;
      }

      // Tip
      const tipMatch = trimmedLine.match(PATTERNS.tip);
      if (tipMatch) {
        const username = tipMatch[1];
        const tokens = parseInt(tipMatch[2], 10);
        if (!this.isExcluded(username)) {
          result.tips.push({ username, tokens });
          result.totalTokens += tokens;
          // Include tip lines for GPT context
          result.filteredChatLines.push(trimmedLine);
        }
        continue;
      }

      // Tip note (from Notice line)
      const tipNoteMatch = trimmedLine.match(PATTERNS.tipNote);
      if (tipNoteMatch) {
        const username = tipNoteMatch[1];
        const note = tipNoteMatch[2];
        // Find the most recent tip from this user and add the note
        const lastTip = [...result.tips].reverse().find((t) => t.username === username && !t.note);
        if (lastTip) {
          lastTip.note = note;
        }
        // Include tip note lines for GPT context
        if (!this.isExcluded(username)) {
          result.filteredChatLines.push(trimmedLine);
        }
        continue;
      }

      // Room subject change
      const subjectMatch = trimmedLine.match(PATTERNS.roomSubject);
      if (subjectMatch) {
        const rawSubject = subjectMatch[1];
        // Normalize: strip token goal counts like "[995 tokens left]" to deduplicate
        const normalizedSubject = this.normalizeRoomSubject(rawSubject);
        // Only add if this normalized version isn't already in the list
        if (!result.roomSubjects.some(s => this.normalizeRoomSubject(s) === normalizedSubject)) {
          result.roomSubjects.push(rawSubject);
        }
        continue;
      }

      // Follow
      const followMatch = trimmedLine.match(PATTERNS.follow);
      if (followMatch && !this.isExcluded(followMatch[1])) {
        result.follows.push(followMatch[1]);
        continue;
      }

      // Unfollow
      const unfollowMatch = trimmedLine.match(PATTERNS.unfollow);
      if (unfollowMatch && !this.isExcluded(unfollowMatch[1])) {
        result.unfollows.push(unfollowMatch[1]);
        continue;
      }

      // Top Lovers Board
      const topLoverMatch = trimmedLine.match(PATTERNS.topLover);
      if (topLoverMatch) {
        const rank = parseInt(topLoverMatch[1], 10);
        const username = topLoverMatch[2];
        const tokens = parseInt(topLoverMatch[3], 10);
        if (!this.isExcluded(username)) {
          // Keep the most recent top lovers board (overwrite previous)
          topLoversMap.set(username, { rank, username, tokens });
          // Include top lovers lines for GPT context
          result.filteredChatLines.push(trimmedLine);
        }
        continue;
      }

      // Private message
      const pmMatch = trimmedLine.match(PATTERNS.privateMessage);
      if (pmMatch && !this.isExcluded(pmMatch[1])) {
        if (!result.privateMessageUsers.includes(pmMatch[1])) {
          result.privateMessageUsers.push(pmMatch[1]);
        }
        continue;
      }

      // Broadcaster warning (identifies known streamers)
      const broadcasterMatch = trimmedLine.match(PATTERNS.broadcasterWarning);
      if (broadcasterMatch) {
        knownStreamersSet.add(broadcasterMatch[1]);
        continue;
      }

      // Chat message (tricky pattern - username attached to message)
      const chatMatch = trimmedLine.match(PATTERNS.chatMessage);
      if (chatMatch && !trimmedLine.startsWith('Notice:') && !trimmedLine.startsWith('User ')) {
        const username = chatMatch[1];
        const message = chatMatch[2];
        if (!this.isExcluded(username)) {
          result.chatMessages.push({
            username,
            message,
            isHudson: username.toLowerCase() === 'hudson_cage',
          });
          uniqueUsers.add(username);
          // Include chat messages for GPT - format as "username: message"
          result.filteredChatLines.push(`${username}: ${message}`);
        }
        continue;
      }
    }

    // Add any remaining visitors who didn't leave
    for (const session of visitorSessions.values()) {
      result.visitors.push(session);
    }

    // Convert top lovers map to sorted array
    result.topLoversBoard = Array.from(topLoversMap.values()).sort((a, b) => a.rank - b.rank);

    // Set unique usernames
    result.uniqueUsernames = Array.from(uniqueUsers).filter((u) => !this.isExcluded(u));

    // Set known streamers
    result.knownStreamers = Array.from(knownStreamersSet);

    return result;
  }

  /**
   * Categorize visitors by whether they stayed (> threshold) or left quickly (< threshold)
   */
  categorizeVisitors(visitors: Visitor[], thresholdMinutes: number = 1): VisitorCategories {
    const stayed: Set<string> = new Set();
    const quick: Set<string> = new Set();
    const thresholdMs = thresholdMinutes * 60 * 1000;

    // Group visitors by username to get total time across multiple visits
    const userTotalTime: Map<string, number> = new Map();

    for (const visitor of visitors) {
      if (this.isExcluded(visitor.username)) continue;

      const duration = visitor.leaveTime
        ? visitor.leaveTime.getTime() - visitor.joinTime.getTime()
        : thresholdMs + 1; // If no leave time, assume they stayed

      const existing = userTotalTime.get(visitor.username) || 0;
      userTotalTime.set(visitor.username, existing + duration);
    }

    for (const [username, totalTime] of userTotalTime) {
      if (totalTime >= thresholdMs) {
        stayed.add(username);
      } else {
        quick.add(username);
      }
    }

    return {
      stayed: Array.from(stayed),
      quick: Array.from(quick),
    };
  }

  /**
   * Calculate average watch time in seconds for visitors
   */
  calculateAvgWatchTime(visitors: Visitor[]): number {
    const validVisitors = visitors.filter(
      (v) => v.leaveTime && !this.isExcluded(v.username)
    );

    if (validVisitors.length === 0) return 0;

    const totalMs = validVisitors.reduce((sum, v) => {
      const duration = v.leaveTime!.getTime() - v.joinTime.getTime();
      return sum + duration;
    }, 0);

    return Math.round(totalMs / validVisitors.length / 1000);
  }

  /**
   * Aggregate tips by username
   */
  aggregateTipsByUser(tips: Tip[]): Array<{ username: string; tokens: number }> {
    const userTotals: Map<string, number> = new Map();

    for (const tip of tips) {
      if (this.isExcluded(tip.username)) continue;
      const existing = userTotals.get(tip.username) || 0;
      userTotals.set(tip.username, existing + tip.tokens);
    }

    return Array.from(userTotals.entries())
      .map(([username, tokens]) => ({ username, tokens }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  /**
   * Get notable chat excerpts (conversations with Hudson)
   */
  getNotableChatExcerpts(messages: ChatMessage[], maxMessages: number = 50): ChatMessage[] {
    // Prioritize messages that are part of conversations (messages from hudson followed by responses)
    const notable: ChatMessage[] = [];
    let lastWasHudson = false;

    for (const msg of messages) {
      if (msg.isHudson) {
        // Always include Hudson's messages
        notable.push(msg);
        lastWasHudson = true;
      } else if (lastWasHudson) {
        // Include responses to Hudson
        notable.push(msg);
        lastWasHudson = false;
      } else if (msg.message.includes('@')) {
        // Include messages that mention someone
        notable.push(msg);
      }

      if (notable.length >= maxMessages) break;
    }

    return notable;
  }

  /**
   * Check if a username should be excluded
   */
  private isExcluded(username: string): boolean {
    return EXCLUDED_USERNAMES.includes(username.toLowerCase());
  }

  /**
   * Normalize room subject for deduplication
   * Strips token goal counts like "[995 tokens left]" so we only keep one variant
   */
  private normalizeRoomSubject(subject: string): string {
    // Remove patterns like "[995 tokens left]", "[2000 tokens remaining]", etc.
    return subject
      .replace(/\[\d+\s*tokens?\s*(left|remaining|to go)?\]/gi, '[GOAL]')
      .trim();
  }

  /**
   * Check if a line should be ignored (system notices, etc.)
   */
  private isIgnorableLine(line: string): boolean {
    const ignorePrefixes = [
      'Broadcaster Rules:',
      'Your cam is visible',
      'Broadcaster hudson_cage is running',
      'Notice: SmokerBot',
      'Notice: 🤖',
      'Notice: 💎',
      'Notice: ↣',
      'Notice: ⵗ≡',
      'Notice: :mtl',
      'Notice: :me_',
      'Notice: :neon',
      'Notice: Follow hudson_cage',
      'Notice: Warning Online Model',
    ];

    return ignorePrefixes.some((prefix) => line.startsWith(prefix));
  }
}

export const transcriptParserService = new TranscriptParserService();
