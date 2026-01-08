/**
 * Storage Service
 *
 * Facade service that selects the appropriate storage provider based on configuration.
 * Manages the pluggable storage system with SSD (primary) and S3 (remote) backends.
 *
 * NOTE: Docker storage has been deprecated. All writes go to SSD.
 * When SSD is unavailable, operations are queued for later processing.
 * Docker provider is kept for reading legacy files during migration.
 */

import { pool } from '../../db/client.js';
import { StorageProvider, StorageConfig, StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats, DEFAULT_STORAGE_CONFIG, isSymlinkCapable } from './types.js';
import { DockerProvider } from './docker-provider.js';
import { SSDProvider, MediaSource } from './ssd-provider.js';
import { S3Provider } from './s3-provider.js';
import { BaseStorageProvider } from './base-provider.js';
import { logger } from '../../config/logger.js';

/**
 * Queued operation for when SSD is unavailable
 */
export interface QueuedOperation {
  id: string;
  type: 'write' | 'symlink';
  relativePath: string;
  buffer?: Buffer;
  mimeType?: string;
  username: string;
  source: string;
  createdAt: Date;
  retryCount: number;
}

class StorageService {
  private config: StorageConfig = DEFAULT_STORAGE_CONFIG;
  private dockerProvider: DockerProvider | null = null; // Legacy - read-only for migration
  private ssdProvider: SSDProvider | null = null;
  private s3Provider: S3Provider | null = null;
  private initialized = false;
  private operationQueue: QueuedOperation[] = [];
  private queueProcessorRunning = false;

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
    // Docker provider - LEGACY read-only for migration
    // Only create if there are still Docker-stored files to read
    this.dockerProvider = new DockerProvider(this.config.local.dockerPath);

    // SSD provider - PRIMARY storage for all writes
    // Always create - this is now the required storage backend
    this.ssdProvider = new SSDProvider(this.config.local.ssdPath);

    // Create S3 provider if enabled and configured (for remote/production)
    if (this.config.external.enabled && this.config.external.s3Bucket) {
      this.s3Provider = new S3Provider({
        bucket: this.config.external.s3Bucket,
        region: this.config.external.s3Region,
        prefix: this.config.external.s3Prefix,
      });
    }

    // Start queue processor for handling operations when SSD was unavailable
    this.startQueueProcessor();
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
   * NOTE: Docker fallback has been removed. Returns null if SSD unavailable (operations will be queued)
   */
  async getWriteProvider(): Promise<StorageProvider | null> {
    await this.ensureInitialized();

    // Remote mode -> S3
    if (this.config.globalMode === 'remote' && this.config.external.enabled) {
      if (this.s3Provider && await this.s3Provider.isAvailable()) {
        return this.s3Provider;
      }
      logger.warn('[StorageService] S3 not available, will queue operation');
    }

    // Local mode - SSD only (no Docker fallback)
    if (this.ssdProvider && await this.ssdProvider.isAvailable()) {
      return this.ssdProvider;
    }

    // SSD not available - caller should queue the operation
    logger.warn('[StorageService] SSD not available - operation will be queued');
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
    docker: { available: boolean; path: string; fileCount?: number; deprecated: boolean };
    ssd: { available: boolean; path: string; fileCount?: number };
    s3: { available: boolean; bucket: string; fileCount?: number };
    queue: { length: number; oldestOperation: Date | null };
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
        deprecated: true, // Docker storage is deprecated - read-only for migration
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
      queue: this.getQueueStatus(),
    };
  }

  /**
   * Write a file using the current write provider (SSD or S3)
   * NOTE: Docker fallback removed. If SSD unavailable, returns error.
   * Callers should use writeWithUsername() for new code, which handles queuing.
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
        error: 'SSD storage not available - operation not queued (use writeWithUsername for queuing)',
      };
    }

    return provider.write(relativePath, data, mimeType);
  }

  /**
   * Write a file using the new username-based path structure
   * Automatically creates symlinks in /all/ folders
   * Queues operation if SSD is unavailable
   */
  async writeWithUsername(
    username: string,
    source: MediaSource,
    filename: string,
    data: Buffer,
    mimeType?: string
  ): Promise<StorageWriteResult & { userSymlink?: string; globalSymlink?: string }> {
    await this.ensureInitialized();

    // Check if SSD is available
    if (!this.ssdProvider || !await this.ssdProvider.isAvailable()) {
      // Queue the operation for later
      const operationId = this.queueOperation({
        type: 'write',
        relativePath: `people/${username}/${this.sourceToFolder(source)}/${filename}`,
        buffer: data,
        mimeType,
        username,
        source,
      });

      logger.warn(`[StorageService] SSD unavailable, queued write operation: ${operationId}`);

      return {
        success: false,
        relativePath: `people/${username}/${this.sourceToFolder(source)}/${filename}`,
        absolutePath: '',
        size: 0,
        sha256: '',
        error: `SSD unavailable - operation queued (ID: ${operationId})`,
        queued: true,
        queueId: operationId,
      } as StorageWriteResult & { queued?: boolean; queueId?: string };
    }

    // Use SSD provider's username-based write
    return this.ssdProvider.writeWithUsername(username, source, filename, data, mimeType);
  }

  /**
   * Map source type to folder name
   */
  private sourceToFolder(source: string): string {
    const mapping: Record<string, string> = {
      'affiliate_api': 'auto',
      'manual_upload': 'uploads',
      'screensnap': 'snaps',
      'profile': 'profile',
      'external': 'uploads',
      'imported': 'uploads',
    };
    return mapping[source] || 'uploads';
  }

  /**
   * Queue an operation for later processing
   */
  private queueOperation(params: {
    type: 'write' | 'symlink';
    relativePath: string;
    buffer?: Buffer;
    mimeType?: string;
    username: string;
    source: string;
  }): string {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const operation: QueuedOperation = {
      id,
      type: params.type,
      relativePath: params.relativePath,
      buffer: params.buffer,
      mimeType: params.mimeType,
      username: params.username,
      source: params.source,
      createdAt: new Date(),
      retryCount: 0,
    };

    this.operationQueue.push(operation);
    logger.info(`[StorageService] Queued operation ${id}: ${params.type} ${params.relativePath}`);

    // Alert if queue is getting large
    if (this.operationQueue.length > 100) {
      logger.error(`[StorageService] Operation queue has ${this.operationQueue.length} items - SSD may be disconnected!`);
    }

    return id;
  }

  /**
   * Start the background queue processor
   */
  private startQueueProcessor(): void {
    if (this.queueProcessorRunning) return;
    this.queueProcessorRunning = true;

    // Process queue every 5 minutes
    setInterval(async () => {
      await this.processQueue();
    }, 5 * 60 * 1000);

    logger.info('[StorageService] Queue processor started');
  }

  /**
   * Process queued operations
   */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    if (this.operationQueue.length === 0) {
      return { processed: 0, failed: 0, remaining: 0 };
    }

    // Check if SSD is available
    if (!this.ssdProvider || !await this.ssdProvider.isAvailable()) {
      logger.debug(`[StorageService] Queue processor: SSD still unavailable, ${this.operationQueue.length} operations pending`);
      return { processed: 0, failed: 0, remaining: this.operationQueue.length };
    }

    logger.info(`[StorageService] Processing ${this.operationQueue.length} queued operations`);

    let processed = 0;
    let failed = 0;
    const failedOperations: QueuedOperation[] = [];

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift()!;

      try {
        if (operation.type === 'write' && operation.buffer) {
          const result = await this.ssdProvider!.writeWithUsername(
            operation.username,
            operation.source as MediaSource,
            operation.relativePath.split('/').pop()!,
            operation.buffer,
            operation.mimeType
          );

          if (result.success) {
            processed++;
            logger.debug(`[StorageService] Processed queued write: ${operation.id}`);
          } else {
            throw new Error(result.error || 'Write failed');
          }
        }
      } catch (error) {
        operation.retryCount++;
        if (operation.retryCount < 3) {
          failedOperations.push(operation);
        } else {
          failed++;
          logger.error(`[StorageService] Failed operation ${operation.id} after 3 retries:`, error);
        }
      }
    }

    // Re-queue failed operations for retry
    this.operationQueue.push(...failedOperations);

    logger.info(`[StorageService] Queue processing complete: ${processed} processed, ${failed} failed, ${this.operationQueue.length} remaining`);
    return { processed, failed, remaining: this.operationQueue.length };
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { length: number; oldestOperation: Date | null } {
    return {
      length: this.operationQueue.length,
      oldestOperation: this.operationQueue.length > 0 ? this.operationQueue[0].createdAt : null,
    };
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

    // Default to SSD path (new standard)
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
   * Get the Docker provider (LEGACY - for reading files during migration only)
   * @deprecated Docker storage is deprecated. Use SSD provider for new writes.
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
