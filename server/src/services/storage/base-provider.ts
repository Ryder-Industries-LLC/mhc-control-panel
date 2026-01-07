/**
 * Base Storage Provider
 *
 * Abstract base class with shared utilities for all storage providers.
 */

import { createHash } from 'crypto';
import { StorageProvider, StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats } from './types';

export abstract class BaseStorageProvider implements StorageProvider {
  abstract readonly type: StorageProviderType;

  abstract isAvailable(): Promise<boolean>;
  abstract write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult>;
  abstract read(relativePath: string): Promise<StorageReadResult | null>;
  abstract exists(relativePath: string): Promise<boolean>;
  abstract delete(relativePath: string): Promise<boolean>;
  abstract getServeUrl(relativePath: string): string;
  abstract getStats(relativePath: string): Promise<StorageFileStats | null>;

  /**
   * Compute SHA256 hash of data
   */
  protected computeSha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get MIME type from file extension
   */
  protected getMimeType(relativePath: string): string {
    const ext = relativePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Extract filename from relative path
   */
  protected getFilename(relativePath: string): string {
    return relativePath.split('/').pop() || relativePath;
  }

  /**
   * Generate canonical path for a profile image
   * Format: profiles/{person_id}/YYYY/MM/{image_id}.{ext}
   */
  static generateCanonicalPath(personId: string, imageId: string, extension: string, date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `profiles/${personId}/${year}/${month}/${imageId}.${extension}`;
  }

  /**
   * Parse canonical path to extract components
   */
  static parseCanonicalPath(relativePath: string): {
    personId: string;
    year: string;
    month: string;
    filename: string;
    imageId: string;
    extension: string;
  } | null {
    const match = relativePath.match(/^profiles\/([^/]+)\/(\d{4})\/(\d{2})\/([^/]+)\.(\w+)$/);
    if (!match) return null;

    const [, personId, year, month, imageId, extension] = match;
    return {
      personId,
      year,
      month,
      filename: `${imageId}.${extension}`,
      imageId,
      extension,
    };
  }
}
