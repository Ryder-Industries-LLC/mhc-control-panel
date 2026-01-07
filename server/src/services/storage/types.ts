/**
 * Storage Provider Types and Interfaces
 *
 * Defines the pluggable storage system abstraction for media files.
 */

export type StorageProviderType = 'docker' | 'ssd' | 's3';
export type StorageGlobalMode = 'local' | 'remote';
export type StorageLocalMode = 'auto' | 'ssd' | 'docker';

/**
 * Storage configuration loaded from app_settings
 */
export interface StorageConfig {
  globalMode: StorageGlobalMode;
  local: {
    mode: StorageLocalMode;
    ssdEnabled: boolean;
    dockerEnabled: boolean;
    ssdPath: string;
    dockerPath: string;
  };
  external: {
    enabled: boolean;
    s3Bucket: string;
    s3Region: string;
    s3Prefix: string;
    cacheEnabled: boolean;
    cacheMaxSizeMb: number;
  };
}

/**
 * Result of a storage write operation
 */
export interface StorageWriteResult {
  success: boolean;
  relativePath: string;
  absolutePath: string;
  size: number;
  sha256: string;
  error?: string;
}

/**
 * Result of a storage read operation
 */
export interface StorageReadResult {
  data: Buffer;
  size: number;
  mimeType?: string;
}

/**
 * File stats from storage
 */
export interface StorageFileStats {
  size: number;
  sha256: string;
  mimeType?: string;
  modifiedAt?: Date;
}

/**
 * Result of a transfer operation
 */
export interface TransferResult {
  success: boolean;
  imageId: string;
  sourceProvider: StorageProviderType;
  destProvider: StorageProviderType;
  relativePath: string;
  size: number;
  sha256: string;
  symlinkCreated?: boolean;
  error?: string;
}

/**
 * Transfer job statistics
 */
export interface TransferStats {
  totalTransferred: number;
  totalFailed: number;
  totalSkipped: number;
  lastRunAt?: Date;
  lastError?: string;
  currentBatchProgress?: {
    current: number;
    total: number;
  };
}

/**
 * Media transfer job configuration
 */
export interface MediaTransferJobConfig {
  enabled: boolean;
  intervalMinutes: number;
  destination: 'auto' | 'ssd' | 's3';
  batchSize: number;
}

/**
 * Storage provider interface
 * All providers must implement this interface
 */
export interface StorageProvider {
  /**
   * Provider type identifier
   */
  readonly type: StorageProviderType;

  /**
   * Check if this provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Write data to storage
   * @param relativePath Path relative to storage root (e.g., profiles/{person_id}/YYYY/MM/{id}.jpg)
   * @param data File data buffer
   * @param mimeType Optional MIME type
   */
  write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult>;

  /**
   * Read data from storage
   * @param relativePath Path relative to storage root
   */
  read(relativePath: string): Promise<StorageReadResult | null>;

  /**
   * Check if a file exists
   * @param relativePath Path relative to storage root
   */
  exists(relativePath: string): Promise<boolean>;

  /**
   * Delete a file from storage
   * @param relativePath Path relative to storage root
   */
  delete(relativePath: string): Promise<boolean>;

  /**
   * Get URL for serving this file
   * For local providers: returns relative URL path
   * For S3: returns pre-signed URL or redirect path
   */
  getServeUrl(relativePath: string): string;

  /**
   * Get file stats including size and SHA256 hash
   * @param relativePath Path relative to storage root
   */
  getStats(relativePath: string): Promise<StorageFileStats | null>;
}

/**
 * Extended provider interface for providers that support symlinks (SSD)
 */
export interface SymlinkCapableProvider extends StorageProvider {
  /**
   * Create a username-based symlink to a file
   * @param relativePath The canonical path to the file
   * @param username The username for the symlink directory
   */
  createSymlink(relativePath: string, username: string): Promise<boolean>;

  /**
   * Remove a username symlink
   * @param relativePath The canonical path (used to derive symlink name)
   * @param username The username for the symlink directory
   */
  removeSymlink(relativePath: string, username: string): Promise<boolean>;
}

/**
 * Type guard to check if a provider supports symlinks
 */
export function isSymlinkCapable(provider: StorageProvider): provider is SymlinkCapableProvider {
  return 'createSymlink' in provider && typeof (provider as SymlinkCapableProvider).createSymlink === 'function';
}

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  globalMode: 'local',
  local: {
    mode: 'auto',
    ssdEnabled: true,
    dockerEnabled: true,
    ssdPath: '/mnt/ssd/mhc-images',
    dockerPath: '/app/data/images',
  },
  external: {
    enabled: false,
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3Prefix: 'profiles/',
    cacheEnabled: true,
    cacheMaxSizeMb: 5000,
  },
};
