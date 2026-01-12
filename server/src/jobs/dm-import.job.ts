import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';
import { DMScraperService, DMThread, RawDMMessage } from '../services/dm-scraper.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';

puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JOB_NAME = 'dm-import';

export interface DMImportConfig {
  enabled: boolean;
  maxThreadsPerRun: number;
  delayBetweenThreads: number;  // ms
  autoImport: boolean;  // Auto-import to interactions after scraping
}

export interface DMImportStats {
  lastRun: Date | null;
  totalRuns: number;
  totalThreadsScraped: number;
  totalMessagesScraped: number;
  totalMessagesImported: number;
  lastRunThreads: number;
  lastRunMessages: number;
  currentThread: string | null;
  progress: number;
  total: number;
}

export class DMImportJob {
  private isRunning = false;
  private isProcessing = false;
  private browser: Browser | null = null;
  private scrapeSessionId: string | null = null;

  private config: DMImportConfig = {
    enabled: true,
    maxThreadsPerRun: 100,
    delayBetweenThreads: 2000,
    autoImport: true,
  };

  private stats: DMImportStats = {
    lastRun: null,
    totalRuns: 0,
    totalThreadsScraped: 0,
    totalMessagesScraped: 0,
    totalMessagesImported: 0,
    lastRunThreads: 0,
    lastRunMessages: 0,
    currentThread: null,
    progress: 0,
    total: 0,
  };

  private userDataDir = path.resolve(__dirname, '../../data/browser-profile');

  /**
   * Initialize job state
   */
  async init(): Promise<void> {
    await JobPersistenceService.ensureJobState(JOB_NAME, this.config);
  }

  /**
   * Sync state from database
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
   * Restore job from database on restart
   */
  async restore(): Promise<boolean> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (!state) {
      logger.info('No persisted state found for DM import job');
      return false;
    }

    if (state.config) {
      this.config = { ...this.config, ...state.config };
    }

    if (state.stats) {
      this.stats = { ...this.stats, ...state.stats };
    }

    // Unlike other jobs, don't auto-restart DM scraping on container restart
    // User should manually start this job
    return false;
  }

  /**
   * Get current status
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
   * Update configuration
   */
  async updateConfig(config: Partial<DMImportConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await JobPersistenceService.saveConfig(JOB_NAME, this.config);
    logger.info('DM import job config updated', { config: this.config });
  }

  /**
   * Get browser instance
   */
  private async getBrowser(headless: boolean = true): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      // Clean up lock files
      const lockFiles = [
        path.join(this.userDataDir, 'SingletonLock'),
        path.join(this.userDataDir, 'SingletonCookie'),
        path.join(this.userDataDir, 'SingletonSocket'),
      ];
      for (const lockFile of lockFiles) {
        try {
          await fs.unlink(lockFile);
        } catch {
          // File doesn't exist
        }
      }

      this.browser = await puppeteerExtra.launch({
        headless,
        userDataDir: this.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Apply cookies to page
   */
  private async applyCookiesToPage(page: Page): Promise<boolean> {
    try {
      const cookiesFilePath = path.resolve(__dirname, '../../data/chaturbate-cookies.json');
      const cookiesData = await fs.readFile(cookiesFilePath, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      await page.setCookie(...cookies);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the job
   */
  async start(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: false, message: 'DM import job is already running' };
    }

    if (!this.config.enabled) {
      return { success: false, message: 'DM import job is disabled' };
    }

    // Check for cookies
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      return { success: false, message: 'No cookies available. Please import cookies first.' };
    }

    logger.info('Starting DM import job');
    this.isRunning = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Start processing in background
    this.runScrape();

    return { success: true, message: 'DM import job started' };
  }

  /**
   * Stop the job
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.isProcessing = false;
    await this.closeBrowser();
    await JobPersistenceService.saveRunningState(JOB_NAME, false);
    logger.info('DM import job stopped');
  }

  /**
   * Halt without persisting (for graceful shutdown)
   */
  async halt(): Promise<void> {
    this.isRunning = false;
    this.isProcessing = false;
    await this.closeBrowser();
    logger.info('DM import job halted (state preserved)');
  }

  /**
   * Scrape a single thread (for testing)
   */
  async scrapeOneThread(username: string): Promise<{
    success: boolean;
    messagesFound: number;
    messagesSaved: number;
    error?: string;
  }> {
    let page: Page | null = null;

    try {
      // Check for cookies
      const hasCookies = await ChaturbateScraperService.hasCookies();
      if (!hasCookies) {
        return { success: false, messagesFound: 0, messagesSaved: 0, error: 'No cookies available' };
      }

      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to homepage first
      await page.goto('https://chaturbate.com/', { waitUntil: 'networkidle2', timeout: 30000 });

      // Apply cookies
      await this.applyCookiesToPage(page);
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

      // Generate session ID
      const sessionId = crypto.randomUUID().substring(0, 8);

      // Scrape the thread
      const messages = await DMScraperService.scrapeThread(page, username, sessionId);

      // Save messages
      const savedCount = await DMScraperService.saveMessages(messages, sessionId);

      // Update scrape state
      const newestHash = messages.length > 0 ? messages[0].messageHash : null;
      await DMScraperService.updateScrapeState(username, messages.length, newestHash);

      logger.info(`Scraped DM thread: ${username}`, { messagesFound: messages.length, saved: savedCount });

      return {
        success: true,
        messagesFound: messages.length,
        messagesSaved: savedCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error scraping single DM thread', { error, username });
      return {
        success: false,
        messagesFound: 0,
        messagesSaved: 0,
        error: errorMessage,
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Scrape up to N threads (for testing)
   */
  async scrapeNThreads(count: number): Promise<{
    success: boolean;
    threadsScraped: number;
    totalMessages: number;
    error?: string;
  }> {
    let page: Page | null = null;

    try {
      const hasCookies = await ChaturbateScraperService.hasCookies();
      if (!hasCookies) {
        return { success: false, threadsScraped: 0, totalMessages: 0, error: 'No cookies available' };
      }

      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await page.goto('https://chaturbate.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.applyCookiesToPage(page);
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

      // Get thread list
      const threads = await DMScraperService.getThreadList(page);

      if (threads.length === 0) {
        return { success: true, threadsScraped: 0, totalMessages: 0, error: 'No DM threads found' };
      }

      const sessionId = crypto.randomUUID().substring(0, 8);
      let threadsScraped = 0;
      let totalMessages = 0;

      for (let i = 0; i < Math.min(count, threads.length); i++) {
        const thread = threads[i];

        try {
          const messages = await DMScraperService.scrapeThread(page, thread.username, sessionId);
          const saved = await DMScraperService.saveMessages(messages, sessionId);

          const newestHash = messages.length > 0 ? messages[0].messageHash : null;
          await DMScraperService.updateScrapeState(thread.username, messages.length, newestHash);

          threadsScraped++;
          totalMessages += saved;

          logger.info(`Scraped thread ${i + 1}/${count}: ${thread.username}`, { messages: messages.length });

          // Delay between threads
          if (i < Math.min(count, threads.length) - 1) {
            await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenThreads));
          }
        } catch (threadError) {
          logger.error(`Error scraping thread ${thread.username}`, { error: threadError });
        }
      }

      return { success: true, threadsScraped, totalMessages };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in scrapeNThreads', { error });
      return { success: false, threadsScraped: 0, totalMessages: 0, error: errorMessage };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Run the full scrape cycle
   */
  private async runScrape(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('DM import job is already processing');
      return;
    }

    let page: Page | null = null;

    try {
      this.isProcessing = true;
      this.stats.lastRunThreads = 0;
      this.stats.lastRunMessages = 0;
      this.stats.progress = 0;

      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await page.goto('https://chaturbate.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.applyCookiesToPage(page);
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

      // Get all threads
      const threads = await DMScraperService.getThreadList(page);
      this.stats.total = Math.min(threads.length, this.config.maxThreadsPerRun);

      logger.info(`Found ${threads.length} DM threads, will scrape up to ${this.stats.total}`);

      // Add threads to scrape state if not exists
      for (const thread of threads) {
        try {
          await query(
            `INSERT INTO dm_scrape_state (thread_username)
             VALUES ($1)
             ON CONFLICT (thread_username) DO NOTHING`,
            [thread.username]
          );
        } catch {
          // Ignore errors
        }
      }

      const sessionId = crypto.randomUUID().substring(0, 8);
      this.scrapeSessionId = sessionId;

      // Scrape threads in order (most recent first)
      for (let i = 0; i < threads.length && i < this.config.maxThreadsPerRun && this.isRunning; i++) {
        const thread = threads[i];
        this.stats.currentThread = thread.username;
        this.stats.progress = i + 1;

        try {
          const messages = await DMScraperService.scrapeThread(page, thread.username, sessionId);
          const saved = await DMScraperService.saveMessages(messages, sessionId);

          const newestHash = messages.length > 0 ? messages[0].messageHash : null;
          await DMScraperService.updateScrapeState(thread.username, messages.length, newestHash);

          this.stats.lastRunThreads++;
          this.stats.lastRunMessages += saved;
          this.stats.totalThreadsScraped++;
          this.stats.totalMessagesScraped += saved;

          logger.info(`Scraped thread ${i + 1}/${this.stats.total}: ${thread.username}`, {
            messages: messages.length,
            saved,
          });

          // Auto-import if enabled
          if (this.config.autoImport && saved > 0) {
            // Import messages from this thread
            const importResult = await query(
              `SELECT id FROM chaturbate_dm_raw_data
               WHERE thread_username = $1 AND imported_at IS NULL`,
              [thread.username]
            );

            for (const row of importResult.rows) {
              const success = await DMScraperService.importToInteraction(row.id);
              if (success) {
                this.stats.totalMessagesImported++;
              }
            }
          }

          // Delay between threads
          if (i < this.config.maxThreadsPerRun - 1) {
            await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenThreads));
          }
        } catch (threadError) {
          logger.error(`Error scraping thread ${thread.username}`, { error: threadError });
        }
      }

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.currentThread = null;

      logger.info('DM import job completed', {
        threads: this.stats.lastRunThreads,
        messages: this.stats.lastRunMessages,
      });
    } catch (error) {
      logger.error('Error in DM import job', { error });
    } finally {
      this.isProcessing = false;
      this.isRunning = false;
      await JobPersistenceService.saveRunningState(JOB_NAME, false);

      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalThreadsScraped: 0,
      totalMessagesScraped: 0,
      totalMessagesImported: 0,
      lastRunThreads: 0,
      lastRunMessages: 0,
      currentThread: null,
      progress: 0,
      total: 0,
    };
    logger.info('DM import job stats reset');
  }
}

export const dmImportJob = new DMImportJob();
