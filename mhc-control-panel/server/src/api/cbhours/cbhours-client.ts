import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger.js';

const BASE_URL = 'https://www.cbhours.com/api.php';
const RATE_LIMIT_MS = 1000; // 1 request per second

export interface CBHoursLiveModel {
  room_status: 'Online' | 'Offline';
  gender?: string;
  rank?: number;
  grank?: number;
  viewers?: number;
  followers?: number;
  current_show?: string;
  room_subject?: string;
  tags?: string[];
  is_new?: boolean;
}

export interface CBHoursLiveResponse {
  server_status: string;
  data: Record<string, CBHoursLiveModel>;
}

export interface CBHoursActivitySegment {
  timestamp: string; // ISO format like "2025-08-12T22:36"
  type: string; // '_public', '_private', '_ticket', '_group'
  rank: string;
  followers: string;
  viewers: string;
  gender: string;
  grank: string;
}

export interface CBHoursActivityResponse {
  response_time: string;
  status: boolean;
  model: string;
  serverStatus: boolean;
  serverMessage: string;
  activity: Record<string, string>; // Date -> formatted string
  total_time: {
    hours: number;
    minutes: number;
  };
  details?: Record<string, CBHoursActivitySegment[]>; // Date -> segments
}

export interface CBHoursMonthsResponse extends Array<string> {}

export class CBHoursClient {
  private client: AxiosInstance;
  private lastRequestTime = 0;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      headers: {
        'User-Agent': 'MHC-Control-Panel/1.0',
      },
    });
  }

  /**
   * Rate limit to 1 request per second
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < RATE_LIMIT_MS) {
      const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get live stats for up to 50 models at once
   * Updates every minute
   */
  async getLiveStats(usernames: string[]): Promise<CBHoursLiveResponse> {
    if (usernames.length === 0) {
      return { server_status: 'up', data: {} };
    }

    if (usernames.length > 50) {
      throw new Error('Maximum 50 usernames per request');
    }

    await this.rateLimit();

    try {
      const response = await this.client.get<CBHoursLiveResponse>('', {
        params: {
          action: 'get_live',
          usernames: usernames.join(','),
        },
      });

      logger.debug('CBHours live stats retrieved', {
        usernames: usernames.length,
        online: Object.values(response.data.data).filter(m => m.room_status === 'Online').length,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.warn('CBHours rate limit exceeded');
        throw new Error('Rate limit exceeded');
      }

      logger.error('Error fetching CBHours live stats', {
        error: error.message,
        usernames: usernames.length,
      });
      throw error;
    }
  }

  /**
   * Get activity data for a model (last 60 days max)
   * Updates every 3 minutes
   */
  async getActivity(
    username: string,
    startDate: string, // YYYY-MM-DD
    endDate: string, // YYYY-MM-DD
    includeDetails = false
  ): Promise<CBHoursActivityResponse> {
    await this.rateLimit();

    try {
      const response = await this.client.get<CBHoursActivityResponse>('', {
        params: {
          action: 'get_activity',
          domain: 'cbhours',
          username: username.toLowerCase(),
          start_date: startDate,
          end_date: endDate,
          tzo: 0, // UTC timezone
          include_details: includeDetails,
        },
      });

      if (!response.data.status) {
        // Model not in trophy database
        logger.debug('Model not in CBHours trophy database', { username });
        throw new Error('Model not in trophy database');
      }

      logger.debug('CBHours activity retrieved', {
        username,
        days: Object.keys(response.data.activity || {}).length,
        totalMinutes: (response.data.total_time?.hours || 0) * 60 + (response.data.total_time?.minutes || 0),
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.warn('CBHours rate limit exceeded');
        throw new Error('Rate limit exceeded');
      }

      if (error.response?.data?.message?.includes('Error Code:300')) {
        // Model not in database
        throw new Error('Model not in trophy database');
      }

      logger.error('Error fetching CBHours activity', {
        error: error.message,
        username,
      });
      throw error;
    }
  }

  /**
   * Get available months for a model
   */
  async getAvailableMonths(username: string): Promise<string[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<string[]>('', {
        params: {
          action: 'get_months',
          domain: 'cbhours',
          username: username.toLowerCase(),
        },
      });

      logger.debug('CBHours available months retrieved', {
        username,
        months: response.data.length,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.warn('CBHours rate limit exceeded');
        throw new Error('Rate limit exceeded');
      }

      logger.error('Error fetching CBHours available months', {
        error: error.message,
        username,
      });
      throw error;
    }
  }

  /**
   * Batch get live stats in groups of 50
   */
  async getLiveStatsBatch(usernames: string[]): Promise<Record<string, CBHoursLiveModel>> {
    const results: Record<string, CBHoursLiveModel> = {};
    const batches: string[][] = [];

    // Split into batches of 50
    for (let i = 0; i < usernames.length; i += 50) {
      batches.push(usernames.slice(i, i + 50));
    }

    logger.info('Fetching CBHours live stats in batches', {
      total: usernames.length,
      batches: batches.length,
    });

    for (const batch of batches) {
      try {
        const response = await this.getLiveStats(batch);
        Object.assign(results, response.data);
      } catch (error: any) {
        logger.error('Error in CBHours batch', { error: error.message, batch: batch.length });
        // Continue with other batches even if one fails
      }
    }

    return results;
  }
}

// Export singleton instance
export const cbhoursClient = new CBHoursClient();
