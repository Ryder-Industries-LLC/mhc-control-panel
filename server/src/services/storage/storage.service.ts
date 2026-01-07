/**
 * Storage Service
 *
 * Facade service that selects the appropriate storage provider based on configuration.
 * Manages the pluggable storage system with Docker, SSD, and S3 backends.
 */

import { pool } from '../../db/client.js';
import { StorageProvider, StorageConfig, StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats, DEFAULT_STORAGE_CONFIG, isSymlinkCapable } from './types.js';
import { DockerProvider } from './docker-provider.js';
import { SSDProvider } from './ssd-provider.js';
import { S3Provider } from './s3-provider.js';
import { BaseStorageProvider } from './base-provider.js';
import { logger } from '../../config/logger.js';

class StorageService {
  private config: StorageConfig = DEFAULT_STORAGE_CONFIG;
  private dockerProvider: DockerProvider | null = null;
  private ssdProvider: SSDProvider | null = null;
  private s3Provider: S3Provider | null = null;
  private initialized = false;

  /**
   * Initialize the storage service by loading config and creating providers
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.loadConfig();
    await this.initializeProviders();
    this.initialized = true;

    logger.info('[StorageService] Initialized with config:', {
      globalMode: this.config.globalMode,
      localMode: this.config.local.mode,
      ssdEnabled: this.config.local.ssdEnabled,
      dockerEnabled: this.config.local.dockerEnabled,
      s3Enabled: this.config.external.enabled,
    });
  }

  /**
   * Load storage configuration from app_settings
   */
  async loadConfig(): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT key, value FROM app_settings WHERE key LIKE 'storage.%'`
      );

      const settings: Record<string, any> = {};
      for (const row of result.rows) {
        // JSONB values come back as native JS types from pg driver
        settings[row.key] = row.value;
      }

      this.config = {
        globalMode: settings['storage.global_mode'] || 'local',
        local: {
          mode: settings['storage.local.mode'] || 'auto',
          ssdEnabled: settings['storage.local.ssd_enabled'] ?? true,
          dockerEnabled: settings['storage.local.docker_enabled'] ?? true,
          ssdPath: settings['storage.local.ssd_path'] || '/mnt/ssd/mhc-images',
          dockerPath: settings['storage.local.docker_path'] || '/app/data/images',
        },
        external: {
          enabled: settings['storage.external.enabled'] ?? false,
          s3Bucket: settings['storage.external.s3_bucket'] || '',
          s3Region: settings['storage.external.s3_region'] || 'us-east-1',
          s3Prefix: settings['storage.external.s3_prefix'] || 'profiles/',
          cacheEnabled: settings['storage.external.cache_enabled'] ?? true,
          cacheMaxSizeMb: settings['storage.external.cache_max_size_mb'] || 5000,
        },
      };
    } catch (error) {
      logger.warn('[StorageService] Failed to load config, using defaults:', error);
    }
  }

  /**
   * Initialize storage providers based on configuration
   */
  private async initializeProviders(): Promise<void> {
    // Always create Docker provider (it's the default)
    if (this.config.local.dockerEnabled) {
      this.dockerProvider = new DockerProvider(this.config.local.dockerPath);
    }

    // Create SSD provider if enabled
    if (this.config.local.ssdEnabled) {
      this.ssdProvider = new SSDProvider(this.config.local.ssdPath);
    }

    // Create S3 provider if enabled and configured
    if (this.config.external.enabled && this.config.external.s3Bucket) {
      this.s3Provider = new S3Provider({
        bucket: this.config.external.s3Bucket,
        region: this.config.external.s3Region,
        prefix: this.config.external.s3Prefix,
      });
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Update storage configuration
   */
  async updateConfig(newConfig: Partial<StorageConfig>): Promise<void> {
    const updates: { key: string; value: string }[] = [];

    if (newConfig.globalMode !== undefined) {
      updates.push({ key: 'storage.global_mode', value: JSON.stringify(newConfig.globalMode) });
    }

    if (newConfig.local) {
      if (newConfig.local.mode !== undefined) {
        updates.push({ key: 'storage.local.mode', value: JSON.stringify(newConfig.local.mode) });
      }
      if (newConfig.local.ssdEnabled !== undefined) {
        updates.push({ key: 'storage.local.ssd_enabled', value: JSON.stringify(newConfig.local.ssdEnabled) });
      }
      if (newConfig.local.dockerEnabled !== undefined) {
        updates.push({ key: 'storage.local.docker_enabled', value: JSON.stringify(newConfig.local.dockerEnabled) });
      }
      if (newConfig.local.ssdPath !== undefined) {
        updates.push({ key: 'storage.local.ssd_path', value: JSON.stringify(newConfig.local.ssdPath) });
      }
      if (newConfig.local.dockerPath !== undefined) {
        updates.push({ key: 'storage.local.docker_path', value: JSON.stringify(newConfig.local.dockerPath) });
      }
    }

    if (newConfig.external) {
      if (newConfig.external.enabled !== undefined) {
        updates.push({ key: 'storage.external.enabled', value: JSON.stringify(newConfig.external.enabled) });
      }
      if (newConfig.external.s3Bucket !== undefined) {
        updates.push({ key: 'storage.external.s3_bucket', value: JSON.stringify(newConfig.external.s3Bucket) });
      }
      if (newConfig.external.s3Region !== undefined) {
        updates.push({ key: 'storage.external.s3_region', value: JSON.stringify(newConfig.external.s3Region) });
      }
      if (newConfig.external.s3Prefix !== undefined) {
        updates.push({ key: 'storage.external.s3_prefix', value: JSON.stringify(newConfig.external.s3Prefix) });
      }
      if (newConfig.external.cacheEnabled !== undefined) {
        updates.push({ key: 'storage.external.cache_enabled', value: JSON.stringify(newConfig.external.cacheEnabled) });
      }
      if (newConfig.external.cacheMaxSizeMb !== undefined) {
        updates.push({ key: 'storage.external.cache_max_size_mb', value: JSON.stringify(newConfig.external.cacheMaxSizeMb) });
      }
    }

    // Update settings in database
    for (const { key, value } of updates) {
      await pool.query(
        `UPDATE app_settings SET value = $1 WHERE key = $2`,
        [value, key]
      );
    }

    // Reload config and reinitialize providers
    await this.loadConfig();
    await this.initializeProviders();

    logger.info('[StorageService] Configuration updated');
  }

  /**
   * Get a specific provider by type
   */
  getProvider(type: StorageProviderType): StorageProvider | null {
    switch (type) {
      case 'docker':
        return this.dockerProvider;
      case 'ssd':
        return this.ssdProvider;
      case 's3':
        return this.s3Provider;
      default:
        return null;
    }
  }

  /**
   * Get the current write provider based on configuration
   */
  async getWriteProvider(): Promise<StorageProvider | null> {
    await this.ensureInitialized();

    // Remote mode -> S3
    if (this.config.globalMode === 'remote' && this.config.external.enabled) {
      if (this.s3Provider && await this.s3Provider.isAvailable()) {
        return this.s3Provider;
      }
      logger.warn('[StorageService] S3 not available, falling back to local');
    }

    // Local mode
    const localMode = this.config.local.mode;

    if (localMode === 'auto') {
      // Prefer SSD if available
      if (this.ssdProvider && await this.ssdProvider.isAvailable()) {
        return this.ssdProvider;
      }
      // Fall back to Docker
      if (this.dockerProvider && await this.dockerProvider.isAvailable()) {
        return this.dockerProvider;
      }
    } else if (localMode === 'ssd') {
      if (this.ssdProvider && await this.ssdProvider.isAvailable()) {
        return this.ssdProvider;
      }
      // Fall back to Docker if SSD unavailable
      logger.warn('[StorageService] SSD not available, falling back to Docker');
      if (this.dockerProvider && await this.dockerProvider.isAvailable()) {
        return this.dockerProvider;
      }
    } else if (localMode === 'docker') {
      if (this.dockerProvider && await this.dockerProvider.isAvailable()) {
        return this.dockerProvider;
      }
    }

    logger.error('[StorageService] No storage provider available!');
    return null;
  }

  /**
   * Get the provider that has a specific file
   */
  async getProviderForFile(relativePath: string): Promise<StorageProvider | null> {
    await this.ensureInitialized();

    // Check each provider in order of preference
    if (this.ssdProvider && await this.ssdProvider.exists(relativePath)) {
      return this.ssdProvider;
    }
    if (this.dockerProvider && await this.dockerProvider.exists(relativePath)) {
      return this.dockerProvider;
    }
    if (this.s3Provider && await this.s3Provider.exists(relativePath)) {
      return this.s3Provider;
    }

    return null;
  }

  /**
   * Get storage status for all providers
   */
  async getStatus(): Promise<{
    currentWriteBackend: StorageProviderType | null;
    docker: { available: boolean; path: string; fileCount?: number };
    ssd: { available: boolean; path: string; fileCount?: number };
    s3: { available: boolean; bucket: string; fileCount?: number };
  }> {
    await this.ensureInitialized();

    const writeProvider = await this.getWriteProvider();

    // Get file counts from database
    const countResult = await pool.query(`
      SELECT storage_provider, COUNT(*) as count
      FROM profile_images
      GROUP BY storage_provider
    `);

    const counts: Record<string, number> = {};
    for (const row of countResult.rows) {
      counts[row.storage_provider] = parseInt(row.count);
    }

    return {
      currentWriteBackend: writeProvider?.type || null,
      docker: {
        available: this.dockerProvider ? await this.dockerProvider.isAvailable() : false,
        path: this.config.local.dockerPath,
        fileCount: counts['docker'] || 0,
      },
      ssd: {
        available: this.ssdProvider ? await this.ssdProvider.isAvailable() : false,
        path: this.config.local.ssdPath,
        fileCount: counts['ssd'] || 0,
      },
      s3: {
        available: this.s3Provider ? await this.s3Provider.isAvailable() : false,
        bucket: this.config.external.s3Bucket,
        fileCount: counts['s3'] || 0,
      },
    };
  }

  /**
   * Write a file using the current write provider
   * Automatically falls back to Docker if preferred provider fails
   */
  async write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult> {
    const provider = await this.getWriteProvider();
    if (!provider) {
      return {
        success: false,
        relativePath,
        absolutePath: '',
        size: 0,
        sha256: '',
        error: 'No storage provider available',
      };
    }

    const result = await provider.write(relativePath, data, mimeType);

    // If write failed and we weren't already using Docker, try Docker as fallback
    if (!result.success && provider.type !== 'docker' && this.dockerProvider) {
      logger.warn(`[StorageService] ${provider.type} write failed, falling back to Docker`, {
        relativePath,
        originalError: result.error,
      });

      const fallbackResult = await this.dockerProvider.write(relativePath, data, mimeType);
      if (fallbackResult.success) {
        logger.info(`[StorageService] Fallback to Docker succeeded for ${relativePath}`);
      }
      return fallbackResult;
    }

    return result;
  }

  /**
   * Read a file, searching all providers
   */
  async read(relativePath: string): Promise<StorageReadResult | null> {
    const provider = await this.getProviderForFile(relativePath);
    if (!provider) {
      return null;
    }

    return provider.read(relativePath);
  }

  /**
   * Get serve URL for a file based on its storage provider
   */
  async getServeUrl(relativePath: string, storageProvider?: StorageProviderType): Promise<string> {
    if (storageProvider) {
      const provider = this.getProvider(storageProvider);
      if (provider) {
        return provider.getServeUrl(relativePath);
      }
    }

    // Find which provider has the file
    const provider = await this.getProviderForFile(relativePath);
    if (provider) {
      return provider.getServeUrl(relativePath);
    }

    // Default to Docker path
    return `/images/${relativePath}`;
  }

  /**
   * Generate canonical path for a profile image
   */
  generateCanonicalPath(personId: string, imageId: string, extension: string, date?: Date): string {
    return BaseStorageProvider.generateCanonicalPath(personId, imageId, extension, date);
  }

  /**
   * Create symlink if the target provider supports it
   */
  async createSymlink(relativePath: string, username: string, provider?: StorageProvider): Promise<boolean> {
    const targetProvider = provider || this.ssdProvider;
    if (!targetProvider || !isSymlinkCapable(targetProvider)) {
      return false;
    }

    return targetProvider.createSymlink(relativePath, username);
  }

  /**
   * Get the SSD provider (for transfer operations)
   */
  getSSDProvider(): SSDProvider | null {
    return this.ssdProvider;
  }

  /**
   * Get the Docker provider (for transfer operations)
   */
  getDockerProvider(): DockerProvider | null {
    return this.dockerProvider;
  }

  /**
   * Get the S3 provider (for transfer operations)
   */
  getS3Provider(): S3Provider | null {
    return this.s3Provider;
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
