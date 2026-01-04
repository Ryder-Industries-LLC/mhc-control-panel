import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface AppSetting {
  key: string;
  value: any;
  description: string | null;
  updated_at: Date;
}

export class SettingsService {
  /**
   * Get a setting value by key
   */
  static async get<T = any>(key: string): Promise<T | null> {
    const result = await query<{ value: T }>(
      'SELECT value FROM app_settings WHERE key = $1',
      [key]
    );

    if (!result.rows[0]) {
      return null;
    }

    return result.rows[0].value;
  }

  /**
   * Get a setting with a default fallback
   */
  static async getWithDefault<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get<T>(key);
    return value !== null ? value : defaultValue;
  }

  /**
   * Set a setting value
   */
  static async set(key: string, value: any, description?: string): Promise<AppSetting> {
    const result = await query<AppSetting>(
      `INSERT INTO app_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = COALESCE(EXCLUDED.description, app_settings.description)
       RETURNING *`,
      [key, JSON.stringify(value), description || null]
    );

    logger.info(`Setting updated: ${key} = ${JSON.stringify(value)}`);
    return result.rows[0];
  }

  /**
   * Get all settings
   */
  static async getAll(): Promise<AppSetting[]> {
    const result = await query<AppSetting>(
      'SELECT * FROM app_settings ORDER BY key'
    );
    return result.rows;
  }

  /**
   * Delete a setting
   */
  static async delete(key: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM app_settings WHERE key = $1',
      [key]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Convenience methods for common settings

  /**
   * Get broadcast merge gap in minutes (default: 30)
   */
  static async getBroadcastMergeGapMinutes(): Promise<number> {
    const value = await this.get<number>('broadcast_merge_gap_minutes');
    return value ?? 30;
  }

  /**
   * Get AI summary delay in minutes (null = use merge gap)
   */
  static async getAISummaryDelayMinutes(): Promise<number | null> {
    const value = await this.get<number | null>('ai_summary_delay_minutes');
    return value;
  }

  /**
   * Get the effective summary delay (ai_summary_delay or merge_gap)
   */
  static async getEffectiveSummaryDelayMinutes(): Promise<number> {
    const aiDelay = await this.getAISummaryDelayMinutes();
    if (aiDelay !== null) {
      return aiDelay;
    }
    return this.getBroadcastMergeGapMinutes();
  }

  // Image upload size limits (in bytes)
  static readonly DEFAULT_IMAGE_LIMIT = 20 * 1024 * 1024; // 20MB

  /**
   * Get image upload limit for manual uploads (in bytes)
   */
  static async getImageUploadLimitManual(): Promise<number> {
    const value = await this.get<number>('image_upload_limit_manual');
    return value ?? this.DEFAULT_IMAGE_LIMIT;
  }

  /**
   * Get image upload limit for external URL imports (in bytes)
   */
  static async getImageUploadLimitExternal(): Promise<number> {
    const value = await this.get<number>('image_upload_limit_external');
    return value ?? this.DEFAULT_IMAGE_LIMIT;
  }

  /**
   * Get image upload limit for screenshots (in bytes)
   */
  static async getImageUploadLimitScreenshot(): Promise<number> {
    const value = await this.get<number>('image_upload_limit_screenshot');
    return value ?? this.DEFAULT_IMAGE_LIMIT;
  }

  /**
   * Get all image upload limits
   */
  static async getImageUploadLimits(): Promise<{
    manual: number;
    external: number;
    screenshot: number;
  }> {
    const [manual, external, screenshot] = await Promise.all([
      this.getImageUploadLimitManual(),
      this.getImageUploadLimitExternal(),
      this.getImageUploadLimitScreenshot(),
    ]);
    return { manual, external, screenshot };
  }
}
