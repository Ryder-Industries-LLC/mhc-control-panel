import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface ChaturbateStats {
  username: string;
  token_balance: number;
  tips_in_last_hour: number;
  votes_up: number;
  votes_down: number;
  satisfaction_score: number;
  last_broadcast: string | number; // ISO date or -1
  time_online: number; // minutes, -1 if not broadcasting
  num_followers: number;
  num_viewers: number;
  num_registered_viewers: number;
}

export class ChaturbateStatsClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://chaturbate.com',
      timeout: 15000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('Chaturbate Stats API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Get stats for a broadcaster
   * Data refreshes every 5 minutes
   */
  async getStats(username: string, token: string): Promise<ChaturbateStats | null> {
    try {
      const response = await this.client.get<ChaturbateStats>('/statsapi/', {
        params: { username, token },
      });

      logger.debug(`Fetched Chaturbate stats for ${username}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.info(`Stats not found for user: ${username}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get stats for hudson_cage using env token
   */
  async getHudsonStats(): Promise<ChaturbateStats | null> {
    return this.getStats(env.CHATURBATE_USERNAME, env.CHATURBATE_STATS_TOKEN!);
  }
}

/**
 * Normalize Chaturbate stats to standard metrics
 */
export function normalizeChaturbateStats(data: ChaturbateStats): Record<string, unknown> {
  return {
    token_balance: data.token_balance,
    tips_in_last_hour: data.tips_in_last_hour,
    votes_up: data.votes_up,
    votes_down: data.votes_down,
    satisfaction_score: data.satisfaction_score,
    last_broadcast: data.last_broadcast === -1 ? null : data.last_broadcast,
    time_online_minutes: data.time_online === -1 ? null : data.time_online,
    num_followers: data.num_followers,
    num_viewers: data.num_viewers,
    num_registered_viewers: data.num_registered_viewers,
  };
}

export const chaturbateStatsClient = new ChaturbateStatsClient();
