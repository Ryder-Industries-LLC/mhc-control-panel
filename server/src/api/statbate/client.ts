import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type {
  Site,
  MemberInfoResponse,
  MemberInfoBatchResponse,
  ModelInfoResponse,
  ModelActivityResponse,
  TipsResponse,
  TopModelsResponse,
} from './types.js';

export class StatbateClient {
  private client: AxiosInstance;

  constructor(apiToken: string = env.STATBATE_API_TOKEN) {
    this.client = axios.create({
      baseURL: 'https://plus.statbate.com/api',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Log requests in debug mode
    this.client.interceptors.request.use((config) => {
      logger.debug(`Statbate API request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Log and handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.handleError(error);
        throw error;
      }
    );
  }

  private handleError(error: AxiosError) {
    if (error.response) {
      logger.error('Statbate API error', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url,
      });
    } else if (error.request) {
      logger.error('Statbate API no response', { url: error.config?.url });
    } else {
      logger.error('Statbate API request setup error', { message: error.message });
    }
  }

  /**
   * Get member info
   * GET /members/{site}/{name}/info
   */
  async getMemberInfo(
    site: Site,
    name: string,
    timezone = 'UTC'
  ): Promise<MemberInfoResponse | null> {
    try {
      const response = await this.client.get<MemberInfoResponse>(
        `/members/${site}/${name}/info`,
        { params: { timezone } }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.info(`Member not found: ${name}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get batch member info
   * POST /members/{site}/info/batch
   */
  async getMemberInfoBatch(
    site: Site,
    names: string[],
    timezone = 'UTC'
  ): Promise<MemberInfoBatchResponse> {
    const response = await this.client.post<MemberInfoBatchResponse>(
      `/members/${site}/info/batch`,
      { names, timezone }
    );
    return response.data;
  }

  /**
   * Get model info
   * GET /model/{site}/{name}/info
   */
  async getModelInfo(
    site: Site,
    name: string,
    options?: {
      range?: [string, string];
      timezone?: string;
    }
  ): Promise<ModelInfoResponse | null> {
    const { range, timezone = 'UTC' } = options || {};

    const params: Record<string, string> = { timezone };
    if (range) {
      params['range[0]'] = range[0];
      params['range[1]'] = range[1];
    }

    try {
      const response = await this.client.get<ModelInfoResponse>(
        `/model/${site}/${name}/info`,
        { params }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.info(`Model not found: ${name}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get model activity
   * GET /model/{site}/{name}/activity
   */
  async getModelActivity(
    site: Site,
    name: string,
    options?: {
      range?: [string, string];
      timezone?: string;
    }
  ): Promise<ModelActivityResponse | null> {
    const { range, timezone = 'UTC' } = options || {};

    const params: Record<string, string> = { timezone };
    if (range) {
      params['range[0]'] = range[0];
      params['range[1]'] = range[1];
    }

    try {
      const response = await this.client.get<ModelActivityResponse>(
        `/model/${site}/${name}/activity`,
        { params }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get member tips
   * GET /members/{site}/{name}/tips
   */
  async getMemberTips(
    site: Site,
    name: string,
    options?: {
      range?: [string, string];
      timezone?: string;
      page?: number;
      perPage?: number;
    }
  ): Promise<TipsResponse> {
    const { range, timezone = 'UTC', page = 1, perPage = 20 } = options || {};

    const params: Record<string, string | number> = { timezone, page, per_page: perPage };
    if (range) {
      params['range[0]'] = range[0];
      params['range[1]'] = range[1];
    }

    const response = await this.client.get<TipsResponse>(
      `/members/${site}/${name}/tips`,
      { params }
    );
    return response.data;
  }

  /**
   * Get model tips
   * GET /model/{site}/{name}/tips
   */
  async getModelTips(
    site: Site,
    name: string,
    options?: {
      range?: [string, string];
      timezone?: string;
      page?: number;
      perPage?: number;
    }
  ): Promise<TipsResponse> {
    const { range, timezone = 'UTC', page = 1, perPage = 20 } = options || {};

    const params: Record<string, string | number> = { timezone, page, per_page: perPage };
    if (range) {
      params['range[0]'] = range[0];
      params['range[1]'] = range[1];
    }

    const response = await this.client.get<TipsResponse>(
      `/model/${site}/${name}/tips`,
      { params }
    );
    return response.data;
  }

  /**
   * Get member's top models
   * GET /members/{site}/{name}/top-models
   */
  async getMemberTopModels(
    site: Site,
    name: string,
    options?: {
      range?: [string, string];
      timezone?: string;
    }
  ): Promise<TopModelsResponse> {
    const { range, timezone = 'UTC' } = options || {};

    const params: Record<string, string> = { timezone };
    if (range) {
      params['range[0]'] = range[0];
      params['range[1]'] = range[1];
    }

    const response = await this.client.get<TopModelsResponse>(
      `/members/${site}/${name}/top-models`,
      { params }
    );
    return response.data;
  }
}

// Export singleton instance
export const statbateClient = new StatbateClient();
