/**
 * S3 Storage Provider
 *
 * Stores files in AWS S3 bucket with pre-signed URL support for serving.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseStorageProvider } from './base-provider.js';
import { StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats } from './types.js';
import { logger } from '../../config/logger.js';

export interface S3ProviderConfig {
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3Provider extends BaseStorageProvider {
  readonly type: StorageProviderType = 's3';
  private client: S3Client | null = null;
  private bucket: string;
  private region: string;
  private prefix: string;
  private presignedUrlTtl = 3600; // 1 hour

  constructor(config: S3ProviderConfig) {
    super();
    this.bucket = config.bucket;
    this.region = config.region;
    this.prefix = config.prefix;

    // Only initialize client if we have credentials
    if (config.accessKeyId && config.secretAccessKey) {
      this.client = new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      // Use environment variables
      this.client = new S3Client({
        region: config.region,
      });
    }
  }

  /**
   * Get the S3 key for a relative path
   */
  private getS3Key(relativePath: string): string {
    return `${this.prefix}${relativePath}`;
  }

  /**
   * Check if S3 is available and configured
   */
  async isAvailable(): Promise<boolean> {
    if (!this.client || !this.bucket) {
      return false;
    }

    try {
      // Try to head a non-existent object to verify bucket access
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}.test`,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      // 404 means bucket is accessible but object doesn't exist - that's fine
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return true;
      }
      // 403 means no access
      if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
        logger.warn('[S3Provider] Access denied to bucket');
        return false;
      }
      // Other errors (network, etc.)
      logger.warn(`[S3Provider] Availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Write file to S3
   */
  async write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult> {
    if (!this.client) {
      return {
        success: false,
        relativePath,
        absolutePath: '',
        size: 0,
        sha256: '',
        error: 'S3 client not configured',
      };
    }

    const key = this.getS3Key(relativePath);
    const contentType = mimeType || this.getMimeType(relativePath);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      });

      await this.client.send(command);

      const sha256 = this.computeSha256(data);

      logger.debug(`[S3Provider] Wrote file: ${key} (${data.length} bytes)`);

      return {
        success: true,
        relativePath,
        absolutePath: `s3://${this.bucket}/${key}`,
        size: data.length,
        sha256,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[S3Provider] Write failed for ${key}: ${message}`);
      return {
        success: false,
        relativePath,
        absolutePath: '',
        size: 0,
        sha256: '',
        error: message,
      };
    }
  }

  /**
   * Read file from S3
   */
  async read(relativePath: string): Promise<StorageReadResult | null> {
    if (!this.client) {
      return null;
    }

    const key = this.getS3Key(relativePath);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      return {
        data,
        size: data.length,
        mimeType: response.ContentType || this.getMimeType(relativePath),
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if file exists in S3
   */
  async exists(relativePath: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const key = this.getS3Key(relativePath);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async delete(relativePath: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const key = this.getS3Key(relativePath);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      logger.debug(`[S3Provider] Deleted file: ${key}`);
      return true;
    } catch (error) {
      logger.error(`[S3Provider] Delete failed for ${key}: ${error}`);
      return false;
    }
  }

  /**
   * Get URL for serving file from S3
   * Returns a redirect path that the server will handle
   */
  getServeUrl(relativePath: string): string {
    // Return a path that the storage routes will redirect to a presigned URL
    return `/api/storage/s3/${relativePath}`;
  }

  /**
   * Generate a pre-signed URL for direct S3 access
   */
  async getPresignedUrl(relativePath: string, expiresIn: number = this.presignedUrlTtl): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const key = this.getS3Key(relativePath);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      logger.error(`[S3Provider] Failed to generate presigned URL for ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Get file stats from S3
   */
  async getStats(relativePath: string): Promise<StorageFileStats | null> {
    if (!this.client) {
      return null;
    }

    const key = this.getS3Key(relativePath);

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const headResponse = await this.client.send(headCommand);

      // Need to read the file to compute SHA256
      const readResult = await this.read(relativePath);
      if (!readResult) {
        return null;
      }

      const sha256 = this.computeSha256(readResult.data);

      return {
        size: headResponse.ContentLength || readResult.size,
        sha256,
        mimeType: headResponse.ContentType || this.getMimeType(relativePath),
        modifiedAt: headResponse.LastModified,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Get prefix
   */
  getPrefix(): string {
    return this.prefix;
  }
}
