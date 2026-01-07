/**
 * AI Summary Service
 *
 * Generates stream summaries using OpenAI's API following Master Hudson's format.
 */

import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  summaryDataCollectorService,
  SummaryData,
  BroadcastSummary,
} from './summary-data-collector.service.js';
import { transcriptParserService } from './transcript-parser.service.js';

// Format date for summary output
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Format time for summary output
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

// Format duration
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

class AISummaryService {
  private openai: OpenAI | null = null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
      logger.info('OpenAI client initialized');
    } else {
      logger.warn('OpenAI API key not configured - AI summaries will not be available');
    }
  }

  /**
   * Check if AI summaries are available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Generate a summary for a broadcast
   */
  async generateSummary(
    broadcastId: string,
    transcript: string
  ): Promise<BroadcastSummary> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    logger.info('Generating AI summary', { broadcastId });

    // Collect all data
    const data = await summaryDataCollectorService.collect(broadcastId, transcript);

    // Build the prompt
    const { systemPrompt, userPrompt } = this.buildPrompts(data);

    // Call OpenAI
    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      max_tokens: env.OPENAI_MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const generationTime = Date.now() - startTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    let fullMarkdown = response.choices[0]?.message?.content || '';

    // Post-process: Bold friends and mark known streamers with *
    fullMarkdown = this.postProcessMarkdown(fullMarkdown, data.friendsList, data.parsed.knownStreamers);

    logger.info('AI summary generated', {
      broadcastId,
      generationTimeMs: generationTime,
      tokensUsed,
      responseLength: fullMarkdown.length,
      inputChatLines: data.parsed.filteredChatLines.length,
    });

    // Build the summary object with structured data
    const topTippers = transcriptParserService.aggregateTipsByUser(data.parsed.tips);

    const summaryData: Partial<BroadcastSummary> = {
      theme: this.extractTheme(fullMarkdown),
      tokens_received: data.tokensReceived,
      tokens_per_hour: data.tokensPerHour,
      max_viewers: data.maxViewers,
      unique_viewers: data.uniqueViewers,
      avg_watch_time_seconds: data.avgWatchTimeSeconds,
      new_followers: data.parsed.follows.length,
      lost_followers: data.parsed.unfollows.length,
      net_followers: data.netFollowers,
      room_subject_variants: data.parsed.roomSubjects,
      visitors_stayed: data.visitorCategories.stayed,
      visitors_quick: data.visitorCategories.quick,
      visitors_banned: [], // Not in transcript currently
      top_tippers: topTippers,
      top_lovers_board: data.parsed.topLoversBoard,
      full_markdown: fullMarkdown,
      transcript_text: transcript,
      ai_model: env.OPENAI_MODEL,
      generation_tokens_used: tokensUsed,
    };

    // Save to database
    const saved = await summaryDataCollectorService.saveSummary(broadcastId, summaryData);

    return saved;
  }

  /**
   * Build the system and user prompts for OpenAI
   */
  private buildPrompts(data: SummaryData): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are generating a stream summary for Master Hudson Cage, a dominant male Chaturbate broadcaster.

Follow these instructions EXACTLY:
${data.instructions}

IMPORTANT RULES:
- DO NOT use em dashes (—). Use commas or "..." for pauses instead.
- Exclude "smk_lover" from all stats, lists, and mentions.
- All lists MUST be bullet points, not comma-separated.
- If a value is unknown or missing, write "Unknown" - never guess.
- Tone: controlled, dominant, precise.

MARKDOWN FORMATTING (CRITICAL):
- The title line MUST start with # (e.g., # S: 2025-12-28 Stream - Theme Here)
- Use ## for all section headers (e.g., ## Overall Vibe, ## Tokens, ## Followers)
- Every section header MUST start with ##
- Use bullet points (- ) for all lists
- Leave one blank line after each header

NOTE: Friends will be bolded and known streamers will be marked with * in post-processing. Just use plain usernames.`;

    // Use all filtered chat lines (chat messages + tips + top lovers notices)
    const chatText = data.parsed.filteredChatLines.join('\n');

    const userPrompt = `Generate a complete stream summary for this broadcast.

## Broadcast Info
- Date: ${formatDate(data.startedAt)}
- Start: ${formatTime(data.startedAt)} (America/New_York)
- End: ${data.endedAt ? formatTime(data.endedAt) + ' (America/New_York)' : 'Unknown'}
- Duration: ${formatDuration(data.durationMinutes)}

## Room Subject
Initial: ${data.parsed.roomSubjects[0] || 'Unknown'}

## Room Subject Variants
${data.parsed.roomSubjects.map((s) => `- ${s}`).join('\n') || '- None recorded'}

## Token Stats
- Total Tokens Received: ${data.tokensReceived}
- Tokens per Hour: ${data.tokensPerHour.toFixed(2)}

## Viewers
- Max Viewers: ${data.maxViewers || 'Unknown'}
- Unique Registered Viewers: ${data.uniqueViewers}
- Avg. Watch Time: ${Math.floor(data.avgWatchTimeSeconds / 60)}m ${data.avgWatchTimeSeconds % 60}s

## Followers
- New Followers: +${data.parsed.follows.length}
- Unfollows (Losers): ${data.parsed.unfollows.length}
- Net Followers: ${data.netFollowers >= 0 ? '+' : ''}${data.netFollowers}
${data.parsed.follows.length > 0 ? `- Gained: ${data.parsed.follows.join(', ')}` : ''}
${data.parsed.unfollows.length > 0 ? `- Lost: ${data.parsed.unfollows.join(', ')}` : ''}

## Private Messages From
${data.parsed.privateMessageUsers.map((u) => `- ${u}`).join('\n') || '- None'}

## Full Chat Log (includes chat messages, tips, and top lovers board updates)
${chatText || 'No chat recorded'}

---

Generate the complete summary following the exact format from the instructions. Include all required sections.
Analyze the chat to identify:
- Overall vibe and engagement
- Notable conversations and dynamics
- Key moments and themes
- Opportunities for next stream`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Post-process the generated markdown to apply formatting
   * - Bold friends: username -> **username**
   * - Mark known streamers: username -> username*
   */
  private postProcessMarkdown(
    markdown: string,
    friends: string[],
    knownStreamers: string[]
  ): string {
    let result = markdown;

    // Bold friends (case-insensitive matching)
    for (const friend of friends) {
      // Match whole word only, not already bolded
      const regex = new RegExp(`(?<!\\*\\*)\\b(${friend})\\b(?!\\*\\*)`, 'gi');
      result = result.replace(regex, '**$1**');
    }

    // Mark known streamers with * (case-insensitive, avoid double-marking)
    for (const streamer of knownStreamers) {
      // Match whole word only, not already marked, not in "Known Streamers" section
      const regex = new RegExp(`\\b(${streamer})\\b(?!\\*)`, 'gi');
      // Only replace outside the Known Streamers section
      const parts = result.split(/## Known Streamers/i);
      if (parts.length === 2) {
        parts[0] = parts[0].replace(regex, '$1*');
        result = parts.join('## Known Streamers');
      } else {
        result = result.replace(regex, '$1*');
      }
    }

    return result;
  }

  /**
   * Extract theme from the generated markdown
   */
  private extractTheme(markdown: string): string | null {
    // Look for "# S: YYYY-MM-DD Stream – <theme>" pattern (with optional # prefix)
    const match = markdown.match(/#?\s*S:\s*\d{4}-\d{2}-\d{2}[/\d]*\s+Stream\s*[–-]\s*(.+)/);
    if (match) {
      return match[1].trim();
    }
    return null;
  }

  /**
   * Regenerate summary using stored transcript
   */
  async regenerateSummary(broadcastId: string): Promise<BroadcastSummary> {
    // Get existing summary to retrieve transcript
    const existing = await summaryDataCollectorService.getSummaryByBroadcastId(broadcastId);
    if (!existing?.transcript_text) {
      throw new Error('No stored transcript found for regeneration');
    }

    return this.generateSummary(broadcastId, existing.transcript_text);
  }

  /**
   * Generate a preview summary without saving to database
   * Used for analyzing other broadcasters' transcripts
   */
  async generatePreview(transcript: string): Promise<{
    summary: Partial<BroadcastSummary>;
    parsedData: {
      tokensReceived: number;
      tokensPerHour: number;
      uniqueViewers: number;
      avgWatchTimeSeconds: number;
      newFollowers: number;
      lostFollowers: number;
      netFollowers: number;
      roomSubjects: string[];
      topTippers: Array<{ username: string; tokens: number }>;
      topLoversBoard: Array<{ rank: number; username: string; tokens: number }>;
      chatMessageCount: number;
      filteredChatLineCount: number;
    };
    tokensUsed: number;
    cost: number;
  }> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    logger.info('Generating preview summary (no database save)');

    // Collect data without requiring a broadcast record
    const data = await summaryDataCollectorService.collectForPreview(transcript);

    // Build the prompt
    const { systemPrompt, userPrompt } = this.buildPrompts(data);

    // Call OpenAI
    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      max_tokens: env.OPENAI_MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const generationTime = Date.now() - startTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    let fullMarkdown = response.choices[0]?.message?.content || '';

    // Post-process: Bold friends and mark known streamers with *
    fullMarkdown = this.postProcessMarkdown(fullMarkdown, data.friendsList, data.parsed.knownStreamers);

    logger.info('Preview summary generated', {
      generationTimeMs: generationTime,
      tokensUsed,
      responseLength: fullMarkdown.length,
      inputChatLines: data.parsed.filteredChatLines.length,
    });

    // Build the summary object with structured data
    const topTippers = transcriptParserService.aggregateTipsByUser(data.parsed.tips);

    // Estimate cost (gpt-4.1-mini pricing: $0.40/1M input, $1.60/1M output)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens * 0.0000004) + (outputTokens * 0.0000016);

    return {
      summary: {
        theme: this.extractTheme(fullMarkdown),
        tokens_received: data.tokensReceived,
        tokens_per_hour: data.tokensPerHour,
        max_viewers: data.maxViewers,
        unique_viewers: data.uniqueViewers,
        avg_watch_time_seconds: data.avgWatchTimeSeconds,
        new_followers: data.parsed.follows.length,
        lost_followers: data.parsed.unfollows.length,
        net_followers: data.netFollowers,
        room_subject_variants: data.parsed.roomSubjects,
        top_tippers: topTippers,
        top_lovers_board: data.parsed.topLoversBoard,
        full_markdown: fullMarkdown,
        ai_model: env.OPENAI_MODEL,
        generation_tokens_used: tokensUsed,
      },
      parsedData: {
        tokensReceived: data.tokensReceived,
        tokensPerHour: data.tokensPerHour,
        uniqueViewers: data.uniqueViewers,
        avgWatchTimeSeconds: data.avgWatchTimeSeconds,
        newFollowers: data.parsed.follows.length,
        lostFollowers: data.parsed.unfollows.length,
        netFollowers: data.netFollowers,
        roomSubjects: data.parsed.roomSubjects,
        topTippers,
        topLoversBoard: data.parsed.topLoversBoard,
        chatMessageCount: data.parsed.chatMessages.length,
        filteredChatLineCount: data.parsed.filteredChatLines.length,
      },
      tokensUsed,
      cost: Math.round(cost * 1000000) / 1000000, // Round to 6 decimal places
    };
  }
}

export const aiSummaryService = new AISummaryService();
