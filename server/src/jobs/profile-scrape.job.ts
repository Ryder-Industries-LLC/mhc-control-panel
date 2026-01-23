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
const DELAY_BETWEEN_PROFILES = 2000; // 2 seconds between profiles
const MAX_PROFILES_PER_RUN = 200; // Limit per run to avoid long-running jobs
const PROFILE_REFRESH_DAYS = 30; // Re-scrape profiles older than this
const JOB_NAME = 'profile-scrape';

export interface ProfileScrapeConfig {
  intervalMinutes: number;
  maxProfilesPerRun: number;
  delayBetweenProfiles: number;
  refreshDays: number;
  enabled: boolean;
  prioritizeFollowing: boolean; // Scrape following list first
  prioritizeWatchlist: boolean; // Scrape watchlist members first
}

export class ProfileScrapeJob {
  private isRunning = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: ProfileScrapeConfig = {
    intervalMinutes: 15,
    maxProfilesPerRun: MAX_PROFILES_PER_RUN,
    delayBetweenProfiles: DELAY_BETWEEN_PROFILES,
    refreshDays: PROFILE_REFRESH_DAYS,
    enabled: true,
    prioritizeFollowing: true,
    prioritizeWatchlist: true,
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
   * Sync state from database without starting the job
   * Used by web server to show accurate status from worker
   */
  async syncStateFromDB(): Promise<void> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (state) {
      this.isRunning = state.is_running;
      if (state.config) {
        this.config = { ...this.config, ...state.config };
      }
      if (state.stats) {
        this.stats = { ...this.stats, ...state.stats };
      }
    }
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
    if (state.is_running) {
      logger.info('Restoring profile-scrape job to running state');
      await this.start();
      return true;
    }

    return false;
  }

  /**
   * Get job status
   * Status states:
   * - Stopped: isRunning=false
   * - Starting: isRunning=true, isProcessing=false (just started, waiting for first cycle)
   * - Processing: isRunning=true, isProcessing=true (actively working)
   * - Waiting: isRunning=true, isProcessing=false (between cycles)
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<ProfileScrapeConfig>) {
    const wasRunning = this.isRunning;

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
    if (this.isRunning) {
      logger.warn('Profile scrape job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Profile scrape job is disabled');
      return;
    }

    // Check cookies - log status but don't block startup
    // The job will check for cookies before each scrape cycle
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      logger.warn('Profile scrape job starting without cookies - will wait for cookies to be imported before processing');
    }

    logger.info('Starting Profile scrape job', {
      intervalMinutes: this.config.intervalMinutes,
      maxProfilesPerRun: this.config.maxProfilesPerRun,
      prioritizeFollowing: this.config.prioritizeFollowing,
      prioritizeWatchlist: this.config.prioritizeWatchlist,
      hasCookies,
    });

    this.isRunning = true;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Run immediately on start (will check for cookies inside runScrape)
    this.runScrape();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.runScrape();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the scrape job (updates database)
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isProcessing = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false);
    logger.info('Profile scrape job stopped');
  }

  /**
   * Halt the scrape job without updating database
   * Used during graceful shutdown to preserve state for restart
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Don't update isRunning/isPaused or database - preserve state for restart
    logger.info('Profile scrape job halted (state preserved)');
  }

  /**
   * Run a single scrape cycle
   */
  private async runScrape() {
    if (this.isProcessing) {
      logger.warn('Profile scrape job is already processing');
      return;
    }

    // Check if cookies are available before processing
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      logger.info('Profile scrape job waiting for cookies to be imported - skipping this cycle');
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
      for (let i = 0; i < profilesToScrape.length && this.isRunning; i++) {
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
   * Priority order: Watchlist > Following > Others
   */
  private async getProfilesToScrape(): Promise<any[]> {
    const limit = this.config.maxProfilesPerRun;
    const profiles: any[] = [];
    const usedIds: string[] = [];

    // 1. Watchlist profiles (highest priority)
    if (this.config.prioritizeWatchlist && profiles.length < limit) {
      const watchlistProfiles = await this.getWatchlistNeedingScrape(limit - profiles.length, usedIds);
      profiles.push(...watchlistProfiles);
      usedIds.push(...watchlistProfiles.map((p: any) => p.id));
    }

    // 2. Following profiles
    if (this.config.prioritizeFollowing && profiles.length < limit) {
      const followingProfiles = await this.getFollowingNeedingScrape(limit - profiles.length, usedIds);
      profiles.push(...followingProfiles);
      usedIds.push(...followingProfiles.map((p: any) => p.id));
    }

    // 3. Other profiles (fill remaining slots)
    if (profiles.length < limit) {
      const remaining = limit - profiles.length;
      const otherProfiles = await this.getOtherProfilesNeedingScrape(remaining, usedIds);
      profiles.push(...otherProfiles);
    }

    return profiles;
  }

  /**
   * Get watchlist profiles that need scraping (highest priority)
   */
  private async getWatchlistNeedingScrape(limit: number, excludeIds: string[]): Promise<any[]> {
    const excludeClause = excludeIds.length > 0
      ? `AND p.id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : '';

    const sql = `
      SELECT p.*
      FROM persons p
      INNER JOIN profiles prof ON prof.person_id = p.id
      INNER JOIN attribute_lookup al_wl ON al_wl.person_id = p.id AND al_wl.attribute_key = 'watch_list' AND al_wl.value = true
      WHERE true
        AND (
          prof.browser_scraped_at IS NULL
          OR prof.browser_scraped_at < NOW() - INTERVAL '${this.config.refreshDays} days'
        )
        ${excludeClause}
      ORDER BY prof.browser_scraped_at ASC NULLS FIRST
      LIMIT $1
    `;

    try {
      const { query } = await import('../db/client.js');
      const params = [limit, ...excludeIds];
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting watchlist profiles to scrape', { error });
      return [];
    }
  }

  /**
   * Get following profiles that need scraping
   */
  private async getFollowingNeedingScrape(limit: number, excludeIds: string[]): Promise<any[]> {
    const excludeClause = excludeIds.length > 0
      ? `AND p.id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : '';

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
        ${excludeClause}
      ORDER BY prof.browser_scraped_at ASC NULLS FIRST
      LIMIT $1
    `;

    try {
      const { query } = await import('../db/client.js');
      const params = [limit, ...excludeIds];
      const result = await query(sql, params);
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
