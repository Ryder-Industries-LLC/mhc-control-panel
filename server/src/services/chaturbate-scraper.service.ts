import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../config/logger.js';
import { FollowerScraperService } from './follower-scraper.service.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ScrapeResult {
  success: boolean;
  usernames: string[];
  error?: string;
}

export class ChaturbateScraperService {
  private static browser: Browser | null = null;
  private static userDataDir = path.resolve(__dirname, '../../data/browser-profile');
  private static cookiesFilePath = path.resolve(__dirname, '../../data/chaturbate-cookies.json');

  /**
   * Initialize browser instance with persistent user data directory
   */
  private static async getBrowser(headless: boolean = true): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      logger.info('Launching Puppeteer browser for Chaturbate scraping...', {
        headless,
        userDataDir: this.userDataDir,
      });

      this.browser = await puppeteer.launch({
        headless,
        userDataDir: this.userDataDir, // Persist cookies and session data
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  static async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  /**
   * Save cookies to file
   */
  static async setCookies(cookies: any[]): Promise<{ success: boolean; message: string }> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.cookiesFilePath);
      await fs.mkdir(dataDir, { recursive: true });

      // Save cookies to file
      await fs.writeFile(this.cookiesFilePath, JSON.stringify(cookies, null, 2));

      logger.info('Cookies saved successfully', { count: cookies.length });

      return {
        success: true,
        message: `Saved ${cookies.length} cookies successfully`,
      };
    } catch (error) {
      logger.error('Error saving cookies', { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save cookies',
      };
    }
  }

  /**
   * Load cookies from file
   */
  private static async loadCookies(): Promise<any[] | null> {
    try {
      const cookiesData = await fs.readFile(this.cookiesFilePath, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      logger.info('Cookies loaded successfully', { count: cookies.length });
      return cookies;
    } catch (error) {
      // File might not exist yet - this is OK
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No cookies file found - cookies not yet imported');
        return null;
      }
      logger.error('Error loading cookies', { error });
      return null;
    }
  }

  /**
   * Check if cookies are available
   */
  static async hasCookies(): Promise<boolean> {
    try {
      await fs.access(this.cookiesFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply cookies to a page
   */
  private static async applyCookiesToPage(page: Page): Promise<boolean> {
    try {
      const cookies = await this.loadCookies();
      if (!cookies || cookies.length === 0) {
        logger.warn('No cookies available to apply to page');
        return false;
      }

      await page.setCookie(...cookies);
      logger.info('Cookies applied to page', { count: cookies.length });
      return true;
    } catch (error) {
      logger.error('Error applying cookies to page', { error });
      return false;
    }
  }

  /**
   * Open browser for manual login (non-headless)
   * Use this once to log in and handle 2FA manually
   * The session will be persisted for future scrapes
   * NOTE: This will not work in Docker containers without X11 forwarding
   * Use cookie import instead
   */
  static async openLoginBrowser(): Promise<{ success: boolean; message: string }> {
    try {
      // Close existing browser if any
      await this.closeBrowser();

      // Open non-headless browser for manual login
      const browser = await this.getBrowser(false);
      const page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to Chaturbate login page
      await page.goto('https://chaturbate.com/auth/login/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      logger.info('Browser opened for manual login. Please log in and handle 2FA if needed.');

      return {
        success: true,
        message: 'Browser opened. Please log in manually. The session will be saved automatically.',
      };
    } catch (error) {
      logger.error('Error opening login browser', { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to open browser',
      };
    }
  }

  /**
   * Navigate to a URL and extract HTML content from all pages
   * Supports URL-based pagination (?page=N)
   */
  private static async navigateAndExtractHTML(page: Page, baseUrl: string, appliedCookies: boolean, paginate: boolean = false): Promise<string | null> {
    try {
      // If pagination is enabled, collect HTML from all pages
      if (paginate) {
        logger.info('Collecting all pages...');
        let allHTML = '';
        let pageNumber = 0;
        const maxPages = 50; // Safety limit
        let emptyPageCount = 0;

        while (pageNumber < maxPages && emptyPageCount < 2) {
          // Construct page URL
          const pageUrl = baseUrl.includes('?')
            ? `${baseUrl}&page=${pageNumber}`
            : `${baseUrl}?page=${pageNumber}`;

          logger.info(`Navigating to ${pageUrl}...`);

          await page.goto(pageUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });

          // Check if we got redirected to login (not logged in)
          const currentUrl = page.url();

          if (currentUrl.includes('/auth/login')) {
            if (appliedCookies) {
              logger.warn('Redirected to login page even with cookies - cookies may be expired. Please re-import cookies.');
            } else {
              logger.warn('Redirected to login page - not authenticated. Please import cookies first.');
            }
            return pageNumber === 0 ? null : allHTML;
          }

          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Count rooms on current page
          const roomCount = await page.evaluate('document.querySelectorAll("li.room_list_room").length') as number;
          logger.info(`Page ${pageNumber}: found ${roomCount} rooms`);

          if (roomCount === 0) {
            emptyPageCount++;
            logger.info(`Empty page encountered (${emptyPageCount}/2)`);
            if (emptyPageCount >= 2) {
              logger.info(`Two consecutive empty pages, stopping pagination`);
              break;
            }
          } else {
            emptyPageCount = 0;
            // Get current page HTML
            const pageHTML = await page.content();
            allHTML += pageHTML;
          }

          pageNumber++;
        }

        logger.info(`Finished collecting ${pageNumber} pages`);
        return allHTML;
      }

      // Single page mode
      logger.info(`Navigating to ${baseUrl}...`);

      await page.goto(baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Check if we got redirected to login (not logged in)
      const currentUrl = page.url();
      logger.info(`Final URL after navigation: ${currentUrl}`);

      if (currentUrl.includes('/auth/login')) {
        if (appliedCookies) {
          logger.warn('Redirected to login page even with cookies - cookies may be expired. Please re-import cookies.');
        } else {
          logger.warn('Redirected to login page - not authenticated. Please import cookies first.');
        }
        return null;
      }

      // Wait for initial content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract HTML content (single page)
      const html = await page.content();
      logger.info(`Successfully extracted HTML from ${currentUrl} (${html.length} characters)`);

      return html;
    } catch (error) {
      logger.error(`Error navigating to ${baseUrl}`, { error });
      return null;
    }
  }

  /**
   * Scrape following lists from Chaturbate
   * Scrapes both /followed-cams and /followed-cams/offline
   * NOTE: You must import cookies first using the Import Cookies button
   */
  static async scrapeFollowing(): Promise<ScrapeResult> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // First navigate to homepage to set up the domain for cookies
      logger.info('Navigating to homepage first to establish session...');
      await page.goto('https://chaturbate.com/', { waitUntil: 'networkidle2', timeout: 30000 });

      // Now apply cookies
      const appliedCookies = await this.applyCookiesToPage(page);

      // Reload the page after applying cookies so they take effect
      if (appliedCookies) {
        logger.info('Reloading page to activate cookies...');
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      }

      // Scrape online followed cams with pagination
      const onlineHTML = await this.navigateAndExtractHTML(
        page,
        'https://chaturbate.com/followed-cams/',
        appliedCookies,
        true  // Enable pagination
      );

      if (!onlineHTML) {
        return {
          success: false,
          usernames: [],
          error: appliedCookies
            ? 'Authentication failed. Your cookies may have expired. Please re-import cookies from your browser.'
            : 'Not authenticated. Please use the Import Cookies button to import cookies from your browser.',
        };
      }

      // Scrape offline followed cams with pagination
      const offlineHTML = await this.navigateAndExtractHTML(
        page,
        'https://chaturbate.com/followed-cams/offline/',
        appliedCookies,
        true  // Enable pagination
      );

      if (!offlineHTML) {
        logger.warn('Failed to scrape offline followed cams, continuing with online only');
      }

      // Parse usernames from both HTMLs
      const onlineUsernames = onlineHTML ? FollowerScraperService.parseFollowingHTML(onlineHTML) : [];
      const offlineUsernames = offlineHTML ? FollowerScraperService.parseFollowingHTML(offlineHTML) : [];

      // Combine and deduplicate
      const allUsernames = [...new Set([...onlineUsernames, ...offlineUsernames])];

      logger.info('Successfully scraped following list', {
        online: onlineUsernames.length,
        offline: offlineUsernames.length,
        total: allUsernames.length,
        onlineUsers: onlineUsernames.slice(0, 10).join(', ') + (onlineUsernames.length > 10 ? '...' : ''),
        offlineUsers: offlineUsernames.slice(0, 10).join(', ') + (offlineUsernames.length > 10 ? '...' : ''),
      });

      return {
        success: true,
        usernames: allUsernames,
      };
    } catch (error) {
      logger.error('Error scraping following list', { error });
      return {
        success: false,
        usernames: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Scrape followers list from Chaturbate
   * NOTE: You must import cookies first using the Import Cookies button
   */
  static async scrapeFollowers(): Promise<ScrapeResult> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Apply cookies to page
      const appliedCookies = await this.applyCookiesToPage(page);

      // Scrape followers page
      const html = await this.navigateAndExtractHTML(
        page,
        'https://chaturbate.com/accounts/followers/',
        appliedCookies
      );

      if (!html) {
        return {
          success: false,
          usernames: [],
          error: appliedCookies
            ? 'Authentication failed. Your cookies may have expired. Please re-import cookies from your browser.'
            : 'Not authenticated. Please use the Import Cookies button to import cookies from your browser.',
        };
      }

      // Parse usernames
      const usernames = html ? FollowerScraperService.parseFollowersHTML(html) : [];

      logger.info('Successfully scraped followers list', {
        total: usernames.length,
      });

      return {
        success: true,
        usernames,
      };
    } catch (error) {
      logger.error('Error scraping followers list', { error });
      return {
        success: false,
        usernames: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
}
