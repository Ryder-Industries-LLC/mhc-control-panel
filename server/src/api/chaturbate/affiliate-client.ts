import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger.js';

export type Gender = 'f' | 'm' | 't' | 'c'; // female, male, trans, couple
export type Region = 'asia' | 'europe_russia' | 'northamerica' | 'southamerica' | 'other';
export type CurrentShow = 'public' | 'private' | 'group' | 'away';

export interface OnlineRoom {
  username: string;
  gender: Gender;
  location: string;
  current_show: CurrentShow;
  room_subject: string;
  tags: string[];
  is_new: boolean;
  is_hd: boolean;
  num_users: number;
  num_followers: number;
  country: string;
  spoken_languages: string;
  display_name: string;
  birthday: string; // YYYY-MM-DD or empty
  age: number | null;
  seconds_online: number;
  image_url: string;
  image_url_360x270: string;
  chat_room_url: string;
  chat_room_url_revshare: string;
  iframe_embed: string;
  iframe_embed_revshare: string;
  slug: string;
}

export interface OnlineRoomsResponse {
  results: OnlineRoom[];
  count: number;
}

export interface OnlineRoomsOptions {
  client_ip?: string; // IP address or 'request_ip'
  format?: 'json' | 'xml' | 'yaml';
  limit?: number; // 1-500
  offset?: number;
  exhibitionist?: boolean;
  gender?: Gender | Gender[];
  region?: Region | Region[];
  tag?: string | string[]; // Max 5 tags
  hd?: boolean;
}

export class ChaturbateAffiliateClient {
  private client: AxiosInstance;
  private wmCode: string;

  constructor(wmCode: string = 'f3wCH') {
    this.wmCode = wmCode;
    this.client = axios.create({
      baseURL: 'https://chaturbate.com/api/public/affiliates',
      timeout: 30000,
    });

    // Log requests
    this.client.interceptors.request.use((config) => {
      logger.debug(`Chaturbate Affiliate API request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Chaturbate Affiliate API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Get online rooms
   * GET /onlinerooms/
   */
  async getOnlineRooms(options?: OnlineRoomsOptions): Promise<OnlineRoomsResponse> {
    const {
      client_ip = 'request_ip',
      format = 'json',
      limit = 100,
      offset = 0,
      exhibitionist,
      gender,
      region,
      tag,
      hd,
    } = options || {};

    // Build query parameters
    const params: Record<string, string | number | boolean> = {
      wm: this.wmCode,
      client_ip,
      format,
      limit,
      offset,
    };

    if (exhibitionist !== undefined) params.exhibitionist = exhibitionist;
    if (hd !== undefined) params.hd = hd;

    // Handle array parameters (gender, region, tag)
    const queryParts: string[] = [];

    // Add base params
    Object.entries(params).forEach(([key, value]) => {
      queryParts.push(`${key}=${encodeURIComponent(value)}`);
    });

    // Add gender filters
    if (gender) {
      const genders = Array.isArray(gender) ? gender : [gender];
      genders.forEach(g => queryParts.push(`gender=${g}`));
    }

    // Add region filters
    if (region) {
      const regions = Array.isArray(region) ? region : [region];
      regions.forEach(r => queryParts.push(`region=${r}`));
    }

    // Add tag filters (max 5)
    if (tag) {
      const tags = Array.isArray(tag) ? tag.slice(0, 5) : [tag];
      tags.forEach(t => queryParts.push(`tag=${encodeURIComponent(t)}`));
    }

    const queryString = queryParts.join('&');
    const url = `/onlinerooms/?${queryString}`;

    try {
      const response = await this.client.get<OnlineRoomsResponse>(url);

      logger.info('Fetched online rooms', {
        count: response.data.results.length,
        total: response.data.count,
        limit,
        offset,
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching online rooms', { error });
      throw error;
    }
  }

  /**
   * Get a specific room by username
   */
  async getRoomByUsername(username: string, options?: OnlineRoomsOptions): Promise<OnlineRoom | null> {
    const response = await this.getOnlineRooms({
      ...options,
      limit: 500, // Get more results to increase chance of finding user
    });

    const room = response.results.find(r => r.username.toLowerCase() === username.toLowerCase());
    return room || null;
  }

  /**
   * Get all rooms with pagination
   */
  async getAllOnlineRooms(options?: Omit<OnlineRoomsOptions, 'limit' | 'offset'>): Promise<OnlineRoom[]> {
    const allRooms: OnlineRoom[] = [];
    let offset = 0;
    const limit = 500; // Max limit per request

    while (true) {
      const response = await this.getOnlineRooms({
        ...options,
        limit,
        offset,
      });

      allRooms.push(...response.results);

      // Check if we've fetched all rooms
      if (allRooms.length >= response.count || response.results.length === 0) {
        break;
      }

      offset += limit;

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(`Fetched all online rooms`, { total: allRooms.length });
    return allRooms;
  }

  /**
   * Search rooms by tag
   */
  async searchByTags(tags: string[], options?: OnlineRoomsOptions): Promise<OnlineRoomsResponse> {
    return this.getOnlineRooms({
      ...options,
      tag: tags.slice(0, 5), // API limits to 5 tags
    });
  }

  /**
   * Get rooms by gender
   */
  async getRoomsByGender(gender: Gender | Gender[], options?: OnlineRoomsOptions): Promise<OnlineRoomsResponse> {
    return this.getOnlineRooms({
      ...options,
      gender,
    });
  }

  /**
   * Get HD rooms only
   */
  async getHDRooms(options?: OnlineRoomsOptions): Promise<OnlineRoomsResponse> {
    return this.getOnlineRooms({
      ...options,
      hd: true,
    });
  }

  /**
   * Get new rooms only
   */
  async getNewRooms(options?: OnlineRoomsOptions): Promise<OnlineRoom[]> {
    const response = await this.getOnlineRooms(options);
    return response.results.filter(room => room.is_new);
  }

  /**
   * Get most popular rooms (by viewer count)
   */
  async getPopularRooms(limit = 100, options?: OnlineRoomsOptions): Promise<OnlineRoom[]> {
    const response = await this.getOnlineRooms({
      ...options,
      limit,
    });

    return response.results.sort((a, b) => b.num_users - a.num_users);
  }
}

// Export singleton instance
export const chaturbateAffiliateClient = new ChaturbateAffiliateClient();
