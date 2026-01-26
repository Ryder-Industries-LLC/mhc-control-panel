/**
 * Database Export Job with GFS Rotation
 *
 * Performs automated database exports to S3 with Grandfather-Father-Son rotation:
 * - Hourly: Keep last 24
 * - Daily: Keep last 7 (midnight exports)
 * - Weekly: Keep last 4 (Sunday midnight)
 * - Monthly: Keep last 12 (1st of month)
 * - Yearly: Keep forever (Jan 1st)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger.js';
import { storageService } from '../services/storage/storage.service.js';

const execAsync = promisify(exec);

export interface DbExportConfig {
  enabled: boolean;
  intervalMinutes: number;
  retention: {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
    yearly: number; // -1 = forever
  };
  s3Prefix: string;
  tempDir: string;
}

export interface DbExportResult {
  success: boolean;
  filename: string;
  size: number;
  s3Path: string;
  duration: number;
  error?: string;
}

export interface DbExportStatus {
  lastExport: Date | null;
  lastExportSize: number;
  lastExportDuration: number;
  totalExports: {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
    yearly: number;
  };
  nextExport: Date | null;
  isRunning: boolean;
}

const DEFAULT_CONFIG: DbExportConfig = {
  enabled: false,
  intervalMinutes: 60, // Hourly
  retention: {
    hourly: 24,
    daily: 7,
    weekly: 4,
    monthly: 12,
    yearly: -1, // Keep forever
  },
  s3Prefix: 'mhc/db-export',
  tempDir: '/tmp/mhc-db-export',
};

class DatabaseExportJob {
  private config: DbExportConfig;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastExport: Date | null = null;
  private lastExportSize: number = 0;
  private lastExportDuration: number = 0;

  constructor(config: Partial<DbExportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the export job
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      logger.warn('[DbExport] Job already running');
      return;
    }

    // Ensure temp directory exists
    await fs.mkdir(this.config.tempDir, { recursive: true });

    // Run immediately on start
    await this.runBackup();

    // Schedule recurring exports
    this.intervalId = setInterval(
      () => this.runBackup(),
      this.config.intervalMinutes * 60 * 1000
    );

    logger.info(`[DbExport] Started with ${this.config.intervalMinutes} minute interval`);
  }

  /**
   * Stop the export job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[DbExport] Stopped');
    }
  }

  /**
   * Get current job status
   */
  getStatus(): DbExportStatus {
    return {
      lastExport: this.lastExport,
      lastExportSize: this.lastExportSize,
      lastExportDuration: this.lastExportDuration,
      totalExports: {
        hourly: 0, // Would need to query S3 to get actual counts
        daily: 0,
        weekly: 0,
        monthly: 0,
        yearly: 0,
      },
      nextExport: this.intervalId
        ? new Date(Date.now() + this.config.intervalMinutes * 60 * 1000)
        : null,
      isRunning: this.isRunning,
    };
  }

  /**
   * Run an export now
   */
  async runBackup(): Promise<DbExportResult> {
    if (this.isRunning) {
      logger.warn('[DbExport] Export already in progress');
      return {
        success: false,
        filename: '',
        size: 0,
        s3Path: '',
        duration: 0,
        error: 'Export already in progress',
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    // Ensure temp directory exists
    await fs.mkdir(this.config.tempDir, { recursive: true });
    const timestamp = new Date();

    try {
      logger.info('[DbExport] Starting export...');

      // Generate filename based on rotation type
      const { filename, s3Path, rotationType } = this.generateExportPath(timestamp);
      const localDumpPath = path.join(this.config.tempDir, `${filename}.sql`);
      const localGzPath = path.join(this.config.tempDir, `${filename}.sql.gz`);

      // Run pg_dump
      await this.executePgDump(localDumpPath);

      // Compress with gzip
      await this.compressFile(localDumpPath, localGzPath);

      // Get file size
      const stats = await fs.stat(localGzPath);
      const fileSize = stats.size;

      // Upload to S3
      await this.uploadToS3(localGzPath, s3Path);

      // Clean up local files
      await this.cleanup(localDumpPath, localGzPath);

      // Apply GFS rotation
      await this.applyRotation(timestamp, rotationType);

      const duration = Date.now() - startTime;

      this.lastExport = timestamp;
      this.lastExportSize = fileSize;
      this.lastExportDuration = duration;

      logger.info(`[DbExport] Completed: ${s3Path} (${this.formatBytes(fileSize)}) in ${duration}ms`);

      return {
        success: true,
        filename,
        size: fileSize,
        s3Path,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DbExport] Failed: ${errorMsg}`);

      return {
        success: false,
        filename: '',
        size: 0,
        s3Path: '',
        duration,
        error: errorMsg,
      };

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate export filename and S3 path based on GFS rotation
   */
  private generateExportPath(timestamp: Date): { filename: string; s3Path: string; rotationType: string } {
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hour = String(timestamp.getHours()).padStart(2, '0');
    const dayOfWeek = timestamp.getDay(); // 0 = Sunday
    const week = this.getWeekNumber(timestamp);

    let rotationType: string;
    let filename: string;
    let subdir: string;

    // Determine rotation type (most specific first)
    if (month === '01' && day === '01' && hour === '00') {
      // Yearly - Jan 1st at midnight
      rotationType = 'yearly';
      filename = `export-${year}-yearly`;
      subdir = 'yearly';
    } else if (day === '01' && hour === '00') {
      // Monthly - 1st of month at midnight
      rotationType = 'monthly';
      filename = `export-${year}-${month}-monthly`;
      subdir = 'monthly';
    } else if (dayOfWeek === 0 && hour === '00') {
      // Weekly - Sunday at midnight
      rotationType = 'weekly';
      filename = `export-${year}-week-${String(week).padStart(2, '0')}`;
      subdir = 'weekly';
    } else if (hour === '00') {
      // Daily - midnight
      rotationType = 'daily';
      filename = `export-${year}-${month}-${day}-daily`;
      subdir = 'daily';
    } else {
      // Hourly
      rotationType = 'hourly';
      filename = `export-${year}-${month}-${day}-${hour}`;
      subdir = 'hourly';
    }

    const s3Path = `${this.config.s3Prefix}/${subdir}/${filename}.sql.gz`;

    return { filename, s3Path, rotationType };
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Execute pg_dump
   */
  private async executePgDump(outputPath: string): Promise<void> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not set');
    }

    // pg_dump with custom format for better compression, or plain SQL
    const cmd = `pg_dump "${dbUrl}" -F p -f "${outputPath}"`;

    logger.debug(`[DbExport] Running pg_dump...`);
    await execAsync(cmd, { maxBuffer: 1024 * 1024 * 500 }); // 500MB buffer
  }

  /**
   * Compress file with gzip
   */
  private async compressFile(inputPath: string, outputPath: string): Promise<void> {
    const cmd = `gzip -c "${inputPath}" > "${outputPath}"`;
    logger.debug(`[DbExport] Compressing...`);
    await execAsync(cmd);
  }

  /**
   * Upload to S3
   */
  private async uploadToS3(localPath: string, s3Path: string): Promise<void> {
    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      throw new Error('S3 provider not available');
    }

    const fileData = await fs.readFile(localPath);
    const result = await s3Provider.write(s3Path, fileData);

    if (!result.success) {
      throw new Error(`S3 upload failed: ${result.error}`);
    }

    logger.debug(`[DbExport] Uploaded to S3: ${s3Path}`);
  }

  /**
   * Clean up local files
   */
  private async cleanup(...paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await fs.unlink(p);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Apply GFS rotation - delete old exports
   */
  private async applyRotation(timestamp: Date, rotationType: string): Promise<void> {
    // For now, just log what we would prune
    // Full implementation would list S3 objects and delete old ones
    logger.debug(`[DbExport] Would apply ${rotationType} rotation (retention: ${this.config.retention[rotationType as keyof typeof this.config.retention]})`);

    // TODO: Implement S3 listing and deletion of old exports
    // This would require:
    // 1. List objects in each rotation directory
    // 2. Parse timestamps from filenames
    // 3. Delete objects older than retention limit
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Singleton instance
export const databaseBackupJob = new DatabaseExportJob();

export default databaseBackupJob;
