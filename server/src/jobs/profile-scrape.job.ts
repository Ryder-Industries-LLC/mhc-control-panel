import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';
import { ProfileService } from '../services/profile.service.js';
import { PersonService } from '../services/person.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { logger } from '../config/logger.js';

/**
 * Background job to scrape profile data from Chaturbate profile pages
 * Uses authenticated browser session to extract bio, photos, and profile info
 *
 * This job runs separately from other jobs because:
 * 1. Browser-based scraping is slow (requires page loads)
 * 2. Need to be careful with rate limiting to avoid detection
 * 3. Requires valid cookies for authentication
 */

// Configuration
const DELAY_BETWEEN_PROFILES = 5000; // 5 seconds between profiles (conservative)
const MAX_PROFILES_PER_RUN = 50; // Limit per run to avoid long-running jobs
const PROFILE_REFRESH_DAYS = 7; // Re-scrape profiles older than this
const JOB_NAME = 'profile-scrape';

export interface ProfileScrapeConfig {
  intervalMinutes: number;
  maxProfilesPerRun: number;
  delayBetweenProfiles: number;
  refreshDays: number;
  enabled: boolean;
  prioritizeFollowing: boolean; // Scrape following list first
}

export class ProfileScrapeJob {
  private isRunning = false;
  private isPaused = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: ProfileScrapeConfig = {
    intervalMinutes: 15,
    maxProfilesPerRun: 50,
    delayBetweenProfiles: DELAY_BETWEEN_PROFILES,
    refreshDays: PROFILE_REFRESH_DAYS,
    enabled: true,
    prioritizeFollowing: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalScraped: 0,
    totalFailed: 0,
    totalSkipped: 0,
    lastRunScraped: 0,
    lastRunFailed: 0,
    lastRunSkipped: 0,
    currentUsername: null as string | null,
    progress: 0,
    total: 0,
  };

  /**
   * Initialize job state in database (on first run)
   */
  async init() {
    await JobPersistenceService.ensureJobState(JOB_NAME, this.config);
  }

  /**
   * Restore job state from database (on container restart)
   */
  async restore(): Promise<boolean> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (!state) {
      logger.info('No persisted state found for profile-scrape job');
      return false;
    }

    // Restore config
    if (state.config) {
      this.config = {
        ...this.config,
        ...state.config,
      };
    }

    // Restore stats if available
    if (state.stats) {
      this.stats = {
        ...this.stats,
        ...state.stats,
      };
    }

    // If job was running, restart it
    if (state.is_running && !state.is_paused) {
      logger.info('Restoring profile-scrape job to running state');
      await this.start();
      return true;
    } else if (state.is_running && state.is_paused) {
      logger.info('Restoring profile-scrape job to paused state');
      this.isRunning = true;
      this.isPaused = true;
      return true;
    }

    return false;
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<ProfileScrapeConfig>) {
    const wasRunning = this.isRunning && !this.isPaused;

    // Stop if running
    if (wasRunning) {
      await this.stop();
    }

    // Update config
    this.config = {
      ...this.config,
      ...config,
    };

    // Persist config to database
    await JobPersistenceService.saveConfig(JOB_NAME, this.config);

    logger.info('Profile scrape job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background scrape job
   */
  async start() {
    if (this.isRunning && !this.isPaused) {
      logger.warn('Profile scrape job is already running');
      return;
    }

    // Check if cookies are available
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      logger.error('Profile scrape job cannot start: No cookies available');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Profile scrape job is disabled');
      return;
    }

    logger.info('Starting Profile scrape job', {
      intervalMinutes: this.config.intervalMinutes,
      maxProfilesPerRun: this.config.maxProfilesPerRun,
      prioritizeFollowing: this.config.prioritizeFollowing,
    });

    this.isRunning = true;
    this.isPaused = false;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);

    // Run immediately on start
    this.runScrape();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isPaused && !this.isProcessing) {
        this.runScrape();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the scrape job
   */
  async pause() {
    if (!this.isRunning) {
      logger.warn('Profile scrape job is not running');
      return;
    }
    this.isPaused = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, true);
    logger.info('Profile scrape job paused');
  }

  /**
   * Resume the scrape job
   */
  async resume() {
    if (!this.isRunning) {
      logger.warn('Profile scrape job is not running');
      return;
    }
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);
    logger.info('Profile scrape job resumed');
  }

  /**
   * Stop the scrape job
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false, false);
    logger.info('Profile scrape job stopped');
  }

  /**
   * Run a single scrape cycle
   */
  private async runScrape() {
    if (this.isProcessing) {
      logger.warn('Profile scrape job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.lastRunScraped = 0;
      this.stats.lastRunFailed = 0;
      this.stats.lastRunSkipped = 0;
      this.stats.progress = 0;

      logger.info('Starting Profile scrape cycle');

      // Get profiles that need scraping
      const profilesToScrape = await this.getProfilesToScrape();

      if (profilesToScrape.length === 0) {
        logger.info('No profiles need scraping');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        return;
      }

      this.stats.total = profilesToScrape.length;
      logger.info(`Found ${profilesToScrape.length} profiles to scrape`);

      // Process profiles one by one
      for (let i = 0; i < profilesToScrape.length && !this.isPaused; i++) {
        const person = profilesToScrape[i];
        this.stats.currentUsername = person.username;
        this.stats.progress = i + 1;

        try {
          // Check if profile needs refresh
          const needsRefresh = await ProfileService.needsRefresh(
            person.id,
            this.config.refreshDays
          );

          if (!needsRefresh) {
            logger.debug(`Skipping ${person.username} - recently scraped`);
            this.stats.lastRunSkipped++;
            this.stats.totalSkipped++;
            continue;
          }

          // Scrape the profile
          logger.info(`Scraping profile ${i + 1}/${profilesToScrape.length}: ${person.username}`);
          const scrapedData = await ChaturbateScraperService.scrapeProfile(person.username);

          if (scrapedData) {
            // Merge with existing profile
            await ProfileService.mergeScrapedProfile(person.id, scrapedData);
            this.stats.lastRunScraped++;
            this.stats.totalScraped++;
            logger.info(`Successfully scraped ${person.username}`, {
              hasBio: !!scrapedData.bio,
              photoCount: scrapedData.photos.length,
              isOnline: scrapedData.isOnline,
            });
          } else {
            logger.warn(`Failed to scrape ${person.username} - profile not accessible`);
            this.stats.lastRunFailed++;
            this.stats.totalFailed++;
          }

          // Delay between profiles
          if (i < profilesToScrape.length - 1) {
            await this.sleep(this.config.delayBetweenProfiles);
          }
        } catch (error) {
          logger.error(`Error scraping ${person.username}`, { error });
          this.stats.lastRunFailed++;
          this.stats.totalFailed++;
        }
      }

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.currentUsername = null;

      logger.info('Profile scrape cycle completed', {
        scraped: this.stats.lastRunScraped,
        failed: this.stats.lastRunFailed,
        skipped: this.stats.lastRunSkipped,
      });
    } catch (error) {
      logger.error('Error in Profile scrape cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get list of profiles that need scraping
   * Prioritizes following list if configured
   */
  private async getProfilesToScrape(): Promise<any[]> {
    const limit = this.config.maxProfilesPerRun;
    const profiles: any[] = [];

    if (this.config.prioritizeFollowing) {
      // First, get profiles we're following that need refresh
      const followingProfiles = await this.getFollowingNeedingScrape(limit);
      profiles.push(...followingProfiles);

      // If we have room, add other profiles
      if (profiles.length < limit) {
        const remaining = limit - profiles.length;
        const otherProfiles = await this.getOtherProfilesNeedingScrape(
          remaining,
          profiles.map(p => p.id)
        );
        profiles.push(...otherProfiles);
      }
    } else {
      // Just get any profiles that need scraping
      const allProfiles = await this.getAllProfilesNeedingScrape(limit);
      profiles.push(...allProfiles);
    }

    return profiles;
  }

  /**
   * Get following profiles that need scraping
   */
  private async getFollowingNeedingScrape(limit: number): Promise<any[]> {
    // Following status is stored in the profiles table
    // Use browser_scraped_at to track Puppeteer-based scraping separately from Affiliate API
    const sql = `
      SELECT p.*
      FROM persons p
      INNER JOIN profiles prof ON prof.person_id = p.id
      WHERE prof.following = true
        AND p.role = 'MODEL'
        AND (
          prof.browser_scraped_at IS NULL
          OR prof.browser_scraped_at < NOW() - INTERVAL '${this.config.refreshDays} days'
        )
      ORDER BY prof.browser_scraped_at ASC NULLS FIRST
      LIMIT $1
    `;

    try {
      const { query } = await import('../db/client.js');
      const result = await query(sql, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting following profiles to scrape', { error });
      return [];
    }
  }

  /**
   * Get other (non-following) profiles that need scraping
   */
  private async getOtherProfilesNeedingScrape(
    limit: number,
    excludeIds: string[]
  ): Promise<any[]> {
    const sql = `
      SELECT p.*
      FROM persons p
      LEFT JOIN profiles prof ON prof.person_id = p.id
      WHERE p.role = 'MODEL'
        AND (
          prof.id IS NULL
          OR prof.browser_scraped_at IS NULL
          OR prof.browser_scraped_at < NOW() - INTERVAL '${this.config.refreshDays} days'
        )
        ${excludeIds.length > 0 ? `AND p.id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})` : ''}
      ORDER BY
        p.last_seen_at DESC NULLS LAST,
        CASE WHEN prof.id IS NULL THEN 0 ELSE 1 END,
        prof.browser_scraped_at ASC NULLS FIRST
      LIMIT $1
    `;

    try {
      const { query } = await import('../db/client.js');
      const params = [limit, ...excludeIds];
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting other profiles to scrape', { error });
      return [];
    }
  }

  /**
   * Get all profiles that need scraping (no priority)
   */
  private async getAllProfilesNeedingScrape(limit: number): Promise<any[]> {
    const sql = `
      SELECT p.*
      FROM persons p
      LEFT JOIN profiles prof ON prof.person_id = p.id
      WHERE p.role = 'MODEL'
        AND (
          prof.id IS NULL
          OR prof.browser_scraped_at IS NULL
          OR prof.browser_scraped_at < NOW() - INTERVAL '${this.config.refreshDays} days'
        )
      ORDER BY
        p.last_seen_at DESC NULLS LAST,
        CASE WHEN prof.id IS NULL THEN 0 ELSE 1 END,
        prof.browser_scraped_at ASC NULLS FIRST
      LIMIT $1
    `;

    try {
      const { query } = await import('../db/client.js');
      const result = await query(sql, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting all profiles to scrape', { error });
      return [];
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalScraped: 0,
      totalFailed: 0,
      totalSkipped: 0,
      lastRunScraped: 0,
      lastRunFailed: 0,
      lastRunSkipped: 0,
      currentUsername: null,
      progress: 0,
      total: 0,
    };
    logger.info('Profile scrape job stats reset');
  }

  /**
   * Manually trigger a scrape for a specific username
   */
  async scrapeOne(username: string): Promise<boolean> {
    try {
      const person = await PersonService.findOrCreate({
        username,
        role: 'MODEL',
      });

      if (!person) {
        logger.error(`Failed to find/create person for ${username}`);
        return false;
      }

      const scrapedData = await ChaturbateScraperService.scrapeProfile(username);
      if (scrapedData) {
        await ProfileService.mergeScrapedProfile(person.id, scrapedData);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error in manual scrape for ${username}`, { error });
      return false;
    }
  }
}

export const profileScrapeJob = new ProfileScrapeJob();
