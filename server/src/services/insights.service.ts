import { PersonService } from './person.service.js';
import { StatbatePollingService } from './statbate-polling.service.js';
import { InteractionService } from './interaction.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { logger } from '../config/logger.js';
import type { Person, Snapshot } from '../types/models.js';

export interface BroadcasterInsightsData {
  // Basic Info
  broadcaster: {
    username: string;
    rid: number | null;
    role: string;
    firstSeen: Date;
    lastSeen: Date;
  };

  // Performance Metrics
  performance: {
    currentStats: {
      rank: number | null;
      gender: number | null;
      income: {
        tokens: number;
        usd: number;
      };
      sessions: {
        count: number;
        totalDurationMinutes: number;
        averageDurationMinutes: number;
      };
      tags: Array<{ name: string; category: string }>;
    };
    trends: {
      last30Days: Snapshot[];
      last90Days: Snapshot[];
      comparisons: {
        thisWeekVsLast: any;
        thisMonthVsLast: any;
      };
    };
  };

  // Viewer Intelligence
  viewers: {
    topTippers: Array<{
      username: string;
      did: number | null;
      totalTipped: number;
      tipCount: number;
      lastTipDate: Date;
      allTimeTokens: number;
    }>;
    engagement: {
      totalInteractions: number;
      chatMessages: number;
      tips: number;
      privateMessages: number;
      uniqueViewers: number;
    };
    patterns: {
      peakInteractionTimes: Array<{ hour: number; count: number }>;
      averageViewerStay: number | null;
      returnRate: number | null;
    };
  };

  // Content Analysis
  content: {
    tags: Array<{ name: string; category: string; frequency?: number }>;
    roomSubjects: string[];
    chatThemes: Array<{ theme: string; frequency: number }>;
  };

  // Recommendations Input Data
  context: {
    industryBenchmarks: {
      averageRank: number;
      averageIncomeUSD: number;
      averageSessionDuration: number;
    };
    competitivePosition: string; // 'top_10%' | 'top_25%' | 'average' | 'below_average'
    growthStage: string; // 'new' | 'growing' | 'established' | 'declining'
  };
}

export class InsightsService {
  /**
   * Aggregate all available data for a broadcaster to generate insights
   */
  static async aggregateBroadcasterData(
    username: string,
    options?: {
      analysisWindowDays?: number; // Default 90 days
      includeDetailedViewerAnalysis?: boolean; // Default true
    }
  ): Promise<BroadcasterInsightsData | null> {
    const { analysisWindowDays = 90, includeDetailedViewerAnalysis = true } = options || {};

    try {
      logger.info(`Aggregating insights data for broadcaster: ${username}`);

      // 1. Get or create person record
      const person = await PersonService.findOrCreate({
        username,
        role: 'MODEL', // Assume model for insights
      });

      if (!person) {
        logger.error('Failed to find or create person record');
        return null;
      }

      // 2. Fetch latest Statbate data
      const modelData = await statbateClient.getModelInfo('chaturbate', username);
      if (!modelData) {
        logger.warn(`No model data found for ${username}`);
        return null;
      }

      // 3. Get snapshot history
      const endDate = new Date();
      const startDate30 = new Date();
      startDate30.setDate(startDate30.getDate() - 30);
      const startDate90 = new Date();
      startDate90.setDate(startDate90.getDate() - analysisWindowDays);

      const last30Days = await StatbatePollingService.getByDateRange(
        person.id,
        'statbate_model',
        startDate30,
        endDate
      );

      const last90Days = await StatbatePollingService.getByDateRange(
        person.id,
        'statbate_model',
        startDate90,
        endDate
      );

      // 4. Get interaction data
      const interactions = await InteractionService.getByPerson(person.id, {
        limit: 1000, // Get more for analysis
      });

      // 5. Analyze top tippers
      const topTippers = await this.analyzeTopTippers(interactions);

      // 6. Calculate engagement metrics
      const engagement = this.calculateEngagementMetrics(interactions);

      // 7. Analyze interaction patterns
      const patterns = this.analyzeInteractionPatterns(interactions);

      // 8. Extract content themes
      const chatThemes = this.extractChatThemes(interactions);

      // 9. Determine competitive position
      const competitivePosition = this.determineCompetitivePosition(
        modelData.data.rank,
        modelData.data.income.usd
      );

      // 10. Determine growth stage
      const growthStage = this.determineGrowthStage(last30Days, last90Days);

      // 11. Build insights data object
      const insightsData: BroadcasterInsightsData = {
        broadcaster: {
          username: person.username,
          rid: person.rid,
          role: person.role,
          firstSeen: person.first_seen_at,
          lastSeen: person.last_seen_at,
        },
        performance: {
          currentStats: {
            rank: modelData.data.rank,
            gender: modelData.data.gender,
            income: {
              tokens: modelData.data.income.tokens,
              usd: modelData.data.income.usd,
            },
            sessions: {
              count: modelData.data.sessions.count,
              totalDurationMinutes: modelData.data.sessions.total_duration,
              averageDurationMinutes: modelData.data.sessions.average_duration,
            },
            tags: modelData.data.tags,
          },
          trends: {
            last30Days,
            last90Days,
            comparisons: {
              thisWeekVsLast: null, // TODO: Implement
              thisMonthVsLast: null, // TODO: Implement
            },
          },
        },
        viewers: {
          topTippers: includeDetailedViewerAnalysis ? topTippers : [],
          engagement,
          patterns,
        },
        content: {
          tags: modelData.data.tags,
          roomSubjects: [], // TODO: Extract from interactions or scrape
          chatThemes,
        },
        context: {
          industryBenchmarks: {
            averageRank: 5000, // TODO: Calculate from database
            averageIncomeUSD: 2000, // TODO: Calculate from database
            averageSessionDuration: 180, // TODO: Calculate from database
          },
          competitivePosition,
          growthStage,
        },
      };

      logger.info(`Successfully aggregated insights data for ${username}`);
      return insightsData;
    } catch (error) {
      logger.error('Error aggregating broadcaster data', { error, username });
      return null;
    }
  }

  /**
   * Analyze top tippers from interactions
   */
  private static async analyzeTopTippers(
    interactions: any[]
  ): Promise<BroadcasterInsightsData['viewers']['topTippers']> {
    const tipEvents = interactions.filter(i => i.type === 'TIP_EVENT');

    // Group by username
    const tipperMap = new Map<string, {
      username: string;
      totalTipped: number;
      tipCount: number;
      lastTipDate: Date;
    }>();

    for (const tip of tipEvents) {
      const username = tip.metadata?.username as string;
      const amount = tip.metadata?.tokens as number || 0;

      if (!username) continue;

      const existing = tipperMap.get(username);
      if (existing) {
        existing.totalTipped += amount;
        existing.tipCount += 1;
        if (new Date(tip.timestamp) > existing.lastTipDate) {
          existing.lastTipDate = new Date(tip.timestamp);
        }
      } else {
        tipperMap.set(username, {
          username,
          totalTipped: amount,
          tipCount: 1,
          lastTipDate: new Date(tip.timestamp),
        });
      }
    }

    // Convert to array and sort by total tipped
    const tippers = Array.from(tipperMap.values())
      .sort((a, b) => b.totalTipped - a.totalTipped)
      .slice(0, 20); // Top 20 tippers

    // Enrich with viewer data
    const enrichedTippers = [];
    for (const tipper of tippers) {
      try {
        const person = await PersonService.findByUsername(tipper.username);
        const memberData = person?.did
          ? await statbateClient.getMemberInfo('chaturbate', tipper.username)
          : null;

        enrichedTippers.push({
          ...tipper,
          did: person?.did || null,
          allTimeTokens: memberData?.data.all_time_tokens || 0,
        });
      } catch (error) {
        // If enrichment fails, just include basic data
        enrichedTippers.push({
          ...tipper,
          did: null,
          allTimeTokens: 0,
        });
      }
    }

    return enrichedTippers;
  }

  /**
   * Calculate engagement metrics
   */
  private static calculateEngagementMetrics(
    interactions: any[]
  ): BroadcasterInsightsData['viewers']['engagement'] {
    const uniqueUsernames = new Set<string>();
    let chatMessages = 0;
    let tips = 0;
    let privateMessages = 0;

    for (const interaction of interactions) {
      const username = interaction.metadata?.username as string;
      if (username) {
        uniqueUsernames.add(username);
      }

      switch (interaction.type) {
        case 'CHAT_MESSAGE':
          chatMessages++;
          break;
        case 'TIP_EVENT':
          tips++;
          break;
        case 'PRIVATE_MESSAGE':
          privateMessages++;
          break;
      }
    }

    return {
      totalInteractions: interactions.length,
      chatMessages,
      tips,
      privateMessages,
      uniqueViewers: uniqueUsernames.size,
    };
  }

  /**
   * Analyze interaction patterns
   */
  private static analyzeInteractionPatterns(
    interactions: any[]
  ): BroadcasterInsightsData['viewers']['patterns'] {
    // Peak interaction times by hour
    const hourCounts = new Array(24).fill(0);

    for (const interaction of interactions) {
      const hour = new Date(interaction.timestamp).getHours();
      hourCounts[hour]++;
    }

    const peakInteractionTimes = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      peakInteractionTimes,
      averageViewerStay: null, // TODO: Calculate from USER_ENTER/USER_LEAVE
      returnRate: null, // TODO: Calculate from unique viewers over time
    };
  }

  /**
   * Extract common chat themes
   */
  private static extractChatThemes(
    interactions: any[]
  ): Array<{ theme: string; frequency: number }> {
    const chatMessages = interactions.filter(i => i.type === 'CHAT_MESSAGE' && i.content);

    // Simple keyword extraction (can be enhanced with NLP)
    const keywords = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);

    for (const msg of chatMessages) {
      const words = (msg.content as string || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      for (const word of words) {
        keywords.set(word, (keywords.get(word) || 0) + 1);
      }
    }

    return Array.from(keywords.entries())
      .map(([theme, frequency]) => ({ theme, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
  }

  /**
   * Determine competitive position based on rank and income
   */
  private static determineCompetitivePosition(
    rank: number,
    incomeUSD: number
  ): string {
    if (rank <= 100 || incomeUSD >= 10000) return 'top_1%';
    if (rank <= 500 || incomeUSD >= 5000) return 'top_5%';
    if (rank <= 1000 || incomeUSD >= 3000) return 'top_10%';
    if (rank <= 2500 || incomeUSD >= 1500) return 'top_25%';
    if (incomeUSD >= 800) return 'average';
    return 'below_average';
  }

  /**
   * Determine growth stage based on trends
   */
  private static determineGrowthStage(
    last30Days: Snapshot[],
    last90Days: Snapshot[]
  ): string {
    if (last90Days.length < 3) return 'new';

    // Calculate income trend
    const recentIncome = last30Days
      .slice(0, 10)
      .reduce((sum, s) => sum + ((s.normalized_metrics?.income_usd as number) || 0), 0) / Math.min(10, last30Days.length);

    const olderIncome = last90Days
      .slice(-10)
      .reduce((sum, s) => sum + ((s.normalized_metrics?.income_usd as number) || 0), 0) / Math.min(10, last90Days.slice(-10).length);

    const growth = ((recentIncome - olderIncome) / Math.max(olderIncome, 1)) * 100;

    if (growth > 20) return 'growing';
    if (growth < -20) return 'declining';
    if (recentIncome > 3000) return 'established';
    return 'stable';
  }
}
