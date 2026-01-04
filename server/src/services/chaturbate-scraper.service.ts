// @ts-nocheck - Browser context code uses DOM APIs in page.evaluate
import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../config/logger.js';
import { FollowerScraperService } from './follower-scraper.service.js';
import { ImageStorageService } from './image-storage.service.js';
import { ProfileImagesService } from './profile-images.service.js';
import { query } from '../db/client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';

// Add stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ScrapeResult {
  success: boolean;
  usernames: string[];
  error?: string;
}

export interface PhotosetItem {
  id: string;
  title: string;
  isVideo: boolean;
  isLocked: boolean;
  thumbnailUrl: string;
  detailUrl: string;
}

export interface ProfileMediaItem {
  url: string;
  localPath: string | null;
  mediaType: 'image' | 'video';
  photosetId: string;
  title: string;
  fileSize?: number;
  mimeType?: string;
}

export interface ScrapedProfileData {
  username: string;
  displayName: string | null;
  bio: string | null;
  age: number | null;
  location: string | null;
  gender: string | null;
  interestedIn: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  height: string | null;
  weight: string | null;
  languages: string[];
  tags: string[];
  photos: {
    url: string;
    localPath: string | null;
    isPrimary: boolean;
    isBackground: boolean;
    isLocked: boolean;
  }[];
  profileMedia: ProfileMediaItem[];
  tipMenu: {
    item: string;
    tokens: number;
  }[];
  socialLinks: {
    platform: string;
    url: string;
  }[];
  fanclubPrice: number | null;
  isOnline: boolean;
  scrapedAt: Date;
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

      // Remove browser profile lock files if they exist
      try {
        const lockFiles = [
          path.join(this.userDataDir, 'SingletonLock'),
          path.join(this.userDataDir, 'SingletonCookie'),
          path.join(this.userDataDir, 'SingletonSocket'),
        ];
        for (const lockFile of lockFiles) {
          try {
            await fs.unlink(lockFile);
            logger.info('Removed browser profile lock file', { file: lockFile });
          } catch {
            // File doesn't exist, ignore
          }
        }
      } catch (error) {
        logger.warn('Error cleaning browser profile locks', { error });
      }

      this.browser = await puppeteerExtra.launch({
        headless,
        userDataDir: this.userDataDir, // Persist cookies and session data
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled', // Hide automation
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
        let pageNumber = 1; // Start at page 1, not 0 (Chaturbate pagination starts at 1)
        const maxPages = 50; // Safety limit
        let emptyPageCount = 0;

        while (pageNumber <= maxPages && emptyPageCount < 2) {
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
          const pageTitle = await page.title();
          logger.info(`Current URL after navigation: ${currentUrl}, Page title: "${pageTitle}"`);

          if (currentUrl.includes('/auth/login') || currentUrl === 'https://chaturbate.com/' || currentUrl.includes('/?next=')) {
            if (appliedCookies) {
              logger.warn('Redirected away from followed-cams page - cookies may be expired or invalid. Please re-import cookies.');
            } else {
              logger.warn('Redirected away from followed-cams page - not authenticated. Please import cookies first.');
            }
            return pageNumber === 0 ? null : allHTML;
          }

          // Check for Cloudflare challenge page
          if (pageTitle.includes('Just a moment')) {
            logger.info(`Cloudflare challenge detected on page ${pageNumber}, waiting 15 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 15000));

            // Check title again after waiting
            const newTitle = await page.title();
            if (newTitle.includes('Just a moment')) {
              logger.warn(`Cloudflare challenge still present after waiting, skipping page ${pageNumber}`);
              emptyPageCount++;
              if (emptyPageCount >= 2) {
                logger.info(`Two consecutive failed pages, stopping pagination`);
                break;
              }
              pageNumber++;
              continue;
            }
          }

          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Add delay between pages to avoid rate limiting
          if (pageNumber > 1) {
            const delay = 3000 + Math.random() * 2000; // 3-5 second random delay
            logger.info(`Adding ${Math.round(delay/1000)}s delay before next page to avoid rate limiting`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          // Count rooms on current page (use [data-room] selector which matches Chaturbate's structure)
          const roomCount = await page.evaluate('document.querySelectorAll("[data-room]").length') as number;
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      logger.error('Error scraping following list', {
        error: errorMessage,
        stack: errorStack
      });
      return {
        success: false,
        usernames: [],
        error: errorMessage,
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

  /**
   * Scrape a user's profile page with authentication
   * Extracts bio, photos, and profile information from the profile page
   */
  static async scrapeProfile(username: string): Promise<ScrapedProfileData | null> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // First navigate to homepage to set up the domain for cookies
      logger.info('Navigating to homepage first to establish session...');
      await page.goto('https://chaturbate.com/', { waitUntil: 'networkidle2', timeout: 30000 });

      // Apply cookies for authenticated access
      const appliedCookies = await this.applyCookiesToPage(page);

      if (appliedCookies) {
        logger.info('Reloading page to activate cookies...');
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      }

      // Navigate to the user's profile
      const profileUrl = `https://chaturbate.com/${username}/`;
      logger.info(`Navigating to profile page: ${profileUrl}`);

      await page.goto(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if profile exists
      const currentUrl = page.url();
      const pageTitle = await page.title();

      if (currentUrl.includes('/auth/login') || pageTitle.includes('Page Not Found')) {
        logger.warn(`Profile not accessible or not found: ${username}`);
        return null;
      }

      // Determine if user is online (has video player) or offline
      const isOnline = await page.evaluate(() => {
        return !!document.querySelector('#defchat') || !!document.querySelector('.video_overlay');
      });

      logger.info(`Profile type for ${username}: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

      // Extract profile data from the page
      // Note: The function passed to evaluate runs in browser context where document/window are available
      const profileData = await page.evaluate((username: string) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const data: any = {
          username,
          displayName: null,
          bio: null,
          age: null,
          location: null,
          gender: null,
          interestedIn: null,
          bodyType: null,
          ethnicity: null,
          hairColor: null,
          eyeColor: null,
          height: null,
          weight: null,
          languages: [],
          tags: [],
          photos: [],
          photosets: [],
          tipMenu: [],
          socialLinks: [],
          fanclubPrice: null,
        };

        // Helper to get text content safely
        const getText = (selector: string): string | null => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || null;
        };

        // Extract bio from #roomTabs section (both online and offline)
        const bioContainer = document.querySelector('#roomTabs .bio, #profile .bio, .bio_wrap, #bio');
        if (bioContainer) {
          data.bio = bioContainer.textContent?.trim() || null;
        }

        // Extract bio from about_me section if not found
        if (!data.bio) {
          const aboutMe = document.querySelector('.about_me_text, .about-me, [data-about]');
          if (aboutMe) {
            data.bio = aboutMe.textContent?.trim() || null;
          }
        }

        // Extract display name
        const displayNameEl = document.querySelector('.username, .broadcaster-name, h1');
        if (displayNameEl) {
          data.displayName = displayNameEl.textContent?.trim() || null;
        }

        // Extract profile details from details section
        const detailsSection = document.querySelector('.details, #profile-details, .profile_section');
        if (detailsSection) {
          const detailItems = detailsSection.querySelectorAll('tr, .detail-row, .info-row');
          detailItems.forEach((item: any) => {
            const labelEl = item.querySelector('th, .label, td:first-child');
            const valueEl = item.querySelector('td:last-child, .value');
            const label = labelEl?.textContent?.trim().toLowerCase() || '';
            const value = valueEl?.textContent?.trim() || '';

            if (label.includes('location')) data.location = value;
            if (label.includes('age')) data.age = parseInt(value, 10) || null;
            if (label.includes('gender') || label.includes('sex')) data.gender = value;
            if (label.includes('interested')) data.interestedIn = value;
            if (label.includes('body')) data.bodyType = value;
            if (label.includes('ethnicity')) data.ethnicity = value;
            if (label.includes('hair')) data.hairColor = value;
            if (label.includes('eye')) data.eyeColor = value;
            if (label.includes('height')) data.height = value;
            if (label.includes('weight')) data.weight = value;
            if (label.includes('language')) {
              data.languages = value.split(',').map((l: string) => l.trim()).filter(Boolean);
            }
          });
        }

        // Extract tags from room
        const tagElements = document.querySelectorAll('.tag, .room-tag, [data-tag], .roomtag a');
        data.tags = Array.from(tagElements)
          .map((el: any) => el.textContent?.trim().replace('#', '') || '')
          .filter(Boolean);

        // Extract photos from profile
        // Look for photo gallery images - skip locked ones
        const photoElements = document.querySelectorAll('.photoset img, .photo-gallery img, .profile_photo img, .photo_holder img');
        const photoUrls: { url: string; isPrimary: boolean; isBackground: boolean; isLocked: boolean }[] = [];

        photoElements.forEach((img: any, idx: number) => {
          const src = img.getAttribute('src') || '';
          const dataSrc = img.getAttribute('data-src') || '';
          const url = src || dataSrc;

          // Skip if no URL or if it's a placeholder
          if (!url || url.includes('placeholder') || url.includes('no_image')) return;

          // Check if image is locked (usually has a lock icon overlay or specific class)
          const parent = img.closest('.photo_holder, .photo-item, .photoset-item');
          const isLocked = parent?.querySelector('.locked, .lock-icon, .private-icon') !== null ||
                          img.classList.contains('locked') ||
                          url.includes('locked');

          if (!isLocked) {
            photoUrls.push({
              url: url.startsWith('http') ? url : `https:${url}`,
              isPrimary: idx === 0,
              isBackground: false,
              isLocked: false,
            });
          }
        });

        data.photos = photoUrls;

        // Extract background image (from CSS or specific element)
        const bioSection = document.querySelector('#roomTabs, #profile, .bio_wrap');
        if (bioSection) {
          const bgStyle = window.getComputedStyle(bioSection).backgroundImage;
          if (bgStyle && bgStyle !== 'none') {
            const bgUrlMatch = bgStyle.match(/url\(["']?([^"')]+)["']?\)/);
            if (bgUrlMatch && bgUrlMatch[1]) {
              data.photos.push({
                url: bgUrlMatch[1].startsWith('http') ? bgUrlMatch[1] : `https:${bgUrlMatch[1]}`,
                isPrimary: false,
                isBackground: true,
                isLocked: false,
              });
            }
          }
        }

        // Extract tip menu
        const tipMenuItems = document.querySelectorAll('.tip-menu-item, .tip_menu_item, [data-tip-item]');
        tipMenuItems.forEach((item: any) => {
          const itemText = item.querySelector('.item, .tip-item-label, td:first-child')?.textContent?.trim() || '';
          const tokensText = item.querySelector('.tokens, .tip-amount, td:last-child')?.textContent?.trim() || '0';
          const tokens = parseInt(tokensText.replace(/[^\d]/g, ''), 10) || 0;
          if (itemText && tokens > 0) {
            data.tipMenu.push({ item: itemText, tokens });
          }
        });

        // Extract social links
        const socialPatterns = ['twitter', 'instagram', 'onlyfans', 'fansly', 'snapchat', 'tiktok', 'amazon', 'wishlist'];
        const allLinks = document.querySelectorAll('a[href]');
        allLinks.forEach((link: any) => {
          const href = link.getAttribute('href') || '';
          const hrefLower = href.toLowerCase();

          for (const pattern of socialPatterns) {
            if (hrefLower.includes(pattern)) {
              data.socialLinks.push({
                platform: pattern,
                url: href,
              });
              break;
            }
          }
        });

        // Extract fanclub price
        const fanclubEl = document.querySelector('.fan-club-price, .fanclub_price, [data-fanclub-price]');
        if (fanclubEl) {
          const priceText = fanclubEl.textContent?.trim() || '';
          data.fanclubPrice = parseInt(priceText.replace(/[^\d]/g, ''), 10) || null;
        }

        // Extract photosets (photos and videos from profile)
        const photosetItems = document.querySelectorAll('[data-testid="photo-video-item"]');
        photosetItems.forEach((item: any) => {
          const href = item.getAttribute('href') || '';
          const title = item.getAttribute('title') || item.querySelector('[data-testid="title"]')?.textContent?.trim() || '';
          const thumbnailUrl = item.querySelector('[data-testid="photo-video-preview"]')?.getAttribute('src') || '';

          // Check if locked (has lock icon)
          const isLocked = !!item.querySelector('[data-testid="lock-icon"]') || !!item.querySelector('[data-testid="token-badge"]');

          // Check if video - look for video icon in multiple ways
          const hasVideoSvg = !!item.querySelector('img[src*="video.svg"]');
          const hasVideoIcon = !!item.querySelector('[data-testid="video-icon"]');
          const hasVideoClass = item.classList.contains('video') || !!item.querySelector('.video-icon, .video-badge');
          const hasPlayIcon = !!item.querySelector('svg[class*="play"], [class*="play-icon"]');
          // Also check if the thumbnail URL suggests it's a video
          const isVideoThumbnail = thumbnailUrl.includes('/videos/') || thumbnailUrl.includes('video');
          const isVideo = hasVideoSvg || hasVideoIcon || hasVideoClass || hasPlayIcon || isVideoThumbnail;

          // Extract photoset ID from href: /photo_videos/photoset/detail/username/12345
          const idMatch = href.match(/\/photo_videos\/photoset\/detail\/[^\/]+\/(\d+)/);
          const id = idMatch ? idMatch[1] : '';

          if (id && !isLocked) {
            data.photosets.push({
              id,
              title,
              isVideo,
              isLocked,
              thumbnailUrl: thumbnailUrl.startsWith('http') ? thumbnailUrl : `https:${thumbnailUrl}`,
              detailUrl: href.startsWith('http') ? href : `https://chaturbate.com${href}`,
            });
          }
        });

        return data;
      }, username);

      // Try to find and click "See All" or "View All" link on the profile page to get ALL photosets
      // The profile page only shows a subset, but there should be a link to see all
      try {
        // First, go back to the profile page since we're still there after the initial scrape
        // Look for "See All" or similar links near the photosets section
        const seeAllLink = await page.evaluate(() => {
          // Look for links that say "See All", "View All", "Show All" etc near photos/videos section
          const links = document.querySelectorAll('a');
          for (const link of links) {
            const text = link.textContent?.toLowerCase() || '';
            const href = link.getAttribute('href') || '';
            if ((text.includes('see all') || text.includes('view all') || text.includes('show all') || text.includes('more')) &&
                href.includes('photo_videos')) {
              return href;
            }
          }
          // Also check for a link that goes directly to the photo_videos page
          const photoVideoLink = document.querySelector('a[href*="/photo_videos/"][href*="' + window.location.pathname.split('/')[1] + '"]');
          if (photoVideoLink) {
            return photoVideoLink.getAttribute('href');
          }
          return null;
        });

        if (seeAllLink) {
          const fullUrl = seeAllLink.startsWith('http') ? seeAllLink : `https://chaturbate.com${seeAllLink}`;
          logger.info(`Found "See All" link for photosets, navigating to: ${fullUrl}`);

          await page.goto(fullUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });

          // Wait for photoset items to load
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extract all photosets from this page (with pagination support)
          let hasMorePages = true;
          const allPhotosetIds = new Set(profileData.photosets.map((p: PhotosetItem) => p.id));

          while (hasMorePages) {
            // Extract photosets from current page - including locked ones for logging
            const pagePhotosets = await page.evaluate(() => {
              const items: any[] = [];
              const photosetItems = document.querySelectorAll('[data-testid="photo-video-item"], .photoset-item, a[href*="/photo_videos/photoset/detail/"]');

              photosetItems.forEach((item: any) => {
                const href = item.getAttribute('href') || '';
                let title = item.getAttribute('title') || '';
                if (!title) {
                  const titleEl = item.querySelector('[data-testid="title"], .title, h3, h4, .photoset-title');
                  title = titleEl?.textContent?.trim() || '';
                }
                if (!title) {
                  const img = item.querySelector('img');
                  title = img?.getAttribute('alt') || '';
                }

                const thumbnailUrl = item.querySelector('[data-testid="photo-video-preview"], img')?.getAttribute('src') || '';

                const isLocked = !!item.querySelector('[data-testid="lock-icon"]') ||
                                 !!item.querySelector('[data-testid="token-badge"]') ||
                                 !!item.querySelector('.lock-icon, .locked');

                const hasVideoSvg = !!item.querySelector('img[src*="video.svg"]');
                const hasVideoIcon = !!item.querySelector('[data-testid="video-icon"]');
                const hasVideoClass = item.classList.contains('video') || !!item.querySelector('.video-icon, .video-badge');
                const hasPlayIcon = !!item.querySelector('svg[class*="play"], [class*="play-icon"]');
                const isVideoThumbnail = thumbnailUrl.includes('/videos/') || thumbnailUrl.includes('video');
                const isVideo = hasVideoSvg || hasVideoIcon || hasVideoClass || hasPlayIcon || isVideoThumbnail;

                const idMatch = href.match(/\/photo_videos\/photoset\/detail\/[^\/]+\/(\d+)/);
                const id = idMatch ? idMatch[1] : '';

                if (id) {
                  items.push({
                    id,
                    title,
                    isVideo,
                    isLocked,
                    thumbnailUrl: thumbnailUrl.startsWith('http') ? thumbnailUrl : `https:${thumbnailUrl}`,
                    detailUrl: href.startsWith('http') ? href : `https://chaturbate.com${href}`,
                  });
                }
              });

              return items;
            });

            logger.info(`Found ${pagePhotosets.length} total photosets on page`, {
              photosets: pagePhotosets.map((p: any) => ({ id: p.id, title: p.title, isVideo: p.isVideo, isLocked: p.isLocked }))
            });

            // Add new photosets that we haven't seen before
            for (const photoset of pagePhotosets) {
              if (!allPhotosetIds.has(photoset.id) && !photoset.isLocked) {
                allPhotosetIds.add(photoset.id);
                profileData.photosets.push(photoset);
                logger.debug(`Found additional photoset: ${photoset.id} - ${photoset.title}`, { isVideo: photoset.isVideo });
              }
            }

            // Check for next page link
            const nextPageUrl = await page.evaluate(() => {
              const nextLink = document.querySelector('a.next, a[rel="next"], .pagination a:last-child, [data-testid="next-page"]');
              if (nextLink && !nextLink.classList.contains('disabled')) {
                return nextLink.getAttribute('href');
              }
              return null;
            });

            if (nextPageUrl) {
              logger.debug(`Navigating to next photosets page: ${nextPageUrl}`);
              const fullNextUrl = nextPageUrl.startsWith('http') ? nextPageUrl : `https://chaturbate.com${nextPageUrl}`;
              await page.goto(fullNextUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
              hasMorePages = false;
            }
          }

          logger.info(`Total photosets found after checking all pages: ${profileData.photosets.length}`);
        } else {
          // No "See All" link found - check if we need to scroll to load more on the profile page
          logger.info(`No "See All" link found, checking for scroll-based loading on profile page`);

          // Scroll down on the profile page to load more photosets if lazy-loaded
          let previousCount = profileData.photosets.length;
          for (let scrollAttempt = 0; scrollAttempt < 5; scrollAttempt++) {
            await page.evaluate(() => {
              window.scrollBy(0, window.innerHeight);
            });
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Re-extract photosets after scrolling
            const morePhotosets = await page.evaluate(() => {
              const items: any[] = [];
              const photosetItems = document.querySelectorAll('[data-testid="photo-video-item"]');

              photosetItems.forEach((item: any) => {
                const href = item.getAttribute('href') || '';
                const title = item.getAttribute('title') || item.querySelector('[data-testid="title"]')?.textContent?.trim() || '';
                const thumbnailUrl = item.querySelector('[data-testid="photo-video-preview"]')?.getAttribute('src') || '';
                const isLocked = !!item.querySelector('[data-testid="lock-icon"]') || !!item.querySelector('[data-testid="token-badge"]');
                const hasVideoSvg = !!item.querySelector('img[src*="video.svg"]');
                const hasVideoIcon = !!item.querySelector('[data-testid="video-icon"]');
                const isVideoThumbnail = thumbnailUrl.includes('/videos/') || thumbnailUrl.includes('video');
                const isVideo = hasVideoSvg || hasVideoIcon || isVideoThumbnail;

                const idMatch = href.match(/\/photo_videos\/photoset\/detail\/[^\/]+\/(\d+)/);
                const id = idMatch ? idMatch[1] : '';

                if (id && !isLocked) {
                  items.push({
                    id,
                    title,
                    isVideo,
                    isLocked,
                    thumbnailUrl: thumbnailUrl.startsWith('http') ? thumbnailUrl : `https:${thumbnailUrl}`,
                    detailUrl: href.startsWith('http') ? href : `https://chaturbate.com${href}`,
                  });
                }
              });

              return items;
            });

            // Add any new photosets found
            const existingIds = new Set(profileData.photosets.map((p: PhotosetItem) => p.id));
            for (const photoset of morePhotosets) {
              if (!existingIds.has(photoset.id)) {
                profileData.photosets.push(photoset);
                existingIds.add(photoset.id);
              }
            }

            // Stop scrolling if we didn't find any new photosets
            if (profileData.photosets.length === previousCount) {
              logger.debug(`No new photosets found after scroll attempt ${scrollAttempt + 1}`);
              break;
            }
            previousCount = profileData.photosets.length;
            logger.info(`Found ${profileData.photosets.length} photosets after scrolling`);
          }
        }
      } catch (photosetsError) {
        logger.warn(`Could not expand photosets listing, using initial results`, { error: photosetsError });
      }

      // Add metadata
      profileData.isOnline = isOnline;
      profileData.scrapedAt = new Date();

      // Download photos (skip locked ones, mark backgrounds)
      const downloadedPhotos: ScrapedProfileData['photos'] = [];

      for (const photo of profileData.photos) {
        if (photo.isLocked) {
          downloadedPhotos.push({ ...photo, localPath: null });
          continue;
        }

        try {
          const localPath = await ImageStorageService.downloadAndSave(
            photo.url,
            username,
            photo.isBackground ? 'full' : 'thumbnail'
          );

          downloadedPhotos.push({
            ...photo,
            localPath,
          });

          logger.debug(`Downloaded photo for ${username}`, {
            url: photo.url,
            localPath,
            isBackground: photo.isBackground
          });
        } catch (error) {
          logger.error(`Failed to download photo for ${username}`, { error, url: photo.url });
          downloadedPhotos.push({ ...photo, localPath: null });
        }
      }

      profileData.photos = downloadedPhotos;

      // Scrape photosets and download media
      const profileMedia: ProfileMediaItem[] = [];

      if (profileData.photosets && profileData.photosets.length > 0) {
        logger.info(`Found ${profileData.photosets.length} unlocked photosets for ${username}`);

        // Get person ID for this username
        let personId: string | null = null;
        try {
          const personResult = await query(
            `SELECT id FROM persons WHERE username = $1`,
            [username]
          );
          if (personResult.rows.length > 0) {
            personId = personResult.rows[0].id;
          }
        } catch (err) {
          logger.warn('Could not find person ID for username', { username, error: err });
        }

        // Get max video size setting
        let maxVideoSize = 524288000; // 500MB default
        try {
          const settingResult = await query(
            `SELECT value FROM app_settings WHERE key = 'max_video_size_bytes'`
          );
          if (settingResult.rows.length > 0) {
            maxVideoSize = parseInt(settingResult.rows[0].value, 10);
          }
        } catch (err) {
          // Use default
        }

        for (const photoset of profileData.photosets) {
          try {
            // Check if we've already downloaded this photoset
            if (personId) {
              const hasPhotoset = await ProfileImagesService.hasPhotoset(personId, photoset.id);
              if (hasPhotoset) {
                logger.debug(`Photoset ${photoset.id} already downloaded for ${username}, skipping`);
                continue;
              }
            }

            logger.info(`Navigating to photoset ${photoset.id}: ${photoset.title}`, { isVideo: photoset.isVideo });

            // Navigate to photoset detail page
            await page.goto(photoset.detailUrl, {
              waitUntil: 'networkidle2',
              timeout: 30000,
            });

            // Wait for content to load - videos may need more time
            await new Promise(resolve => setTimeout(resolve, photoset.isVideo ? 3000 : 2000));

            // Extract media from detail page
            const mediaItems = await page.evaluate(() => {
              const items: { url: string; isVideo: boolean }[] = [];

              // Look for video element with data-testid
              const videoEl = document.querySelector('[data-testid="user-video"]') as HTMLVideoElement;
              if (videoEl && videoEl.src) {
                items.push({ url: videoEl.src, isVideo: true });
              }

              // Check ALL video elements on the page
              const allVideos = document.querySelectorAll('video');
              allVideos.forEach((video: HTMLVideoElement) => {
                // Check video.src directly
                if (video.src && video.src.includes('highwebmedia.com') && !items.some(i => i.url === video.src)) {
                  items.push({ url: video.src, isVideo: true });
                }
                // Check source tags inside video
                const sources = video.querySelectorAll('source');
                sources.forEach((source: HTMLSourceElement) => {
                  const src = source.src || source.getAttribute('src');
                  if (src && src.includes('highwebmedia.com') && !items.some(i => i.url === src)) {
                    items.push({ url: src, isVideo: true });
                  }
                });
              });

              // Also check for video in source tags outside video element
              const videoSource = document.querySelector('video source');
              if (videoSource) {
                const src = videoSource.getAttribute('src');
                if (src && !items.some(i => i.url === src)) {
                  items.push({ url: src, isVideo: true });
                }
              }

              // Look for images in gallery
              const imageEls = document.querySelectorAll('.photoset-image img, .gallery-image img, [data-testid="photoset-image"] img');
              imageEls.forEach((img: any) => {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && !src.includes('placeholder')) {
                  // Try to get full-size URL by removing size constraints
                  let fullUrl = src;
                  // CB uses URLs like /u/p/c/XX/hash.jpg - these are full size
                  if (!fullUrl.startsWith('http')) {
                    fullUrl = fullUrl.startsWith('//') ? `https:${fullUrl}` : `https://chaturbate.com${fullUrl}`;
                  }
                  items.push({ url: fullUrl, isVideo: false });
                }
              });

              // If no gallery images found, look for any large images on the page
              if (items.filter(i => !i.isVideo).length === 0) {
                const allImages = document.querySelectorAll('img');
                allImages.forEach((img: any) => {
                  const src = img.getAttribute('src') || '';
                  // Look for images from the CB CDN that aren't thumbnails
                  if (src.includes('highwebmedia.com') && !src.includes('150x100') && !src.includes('thumbnail')) {
                    let fullUrl = src;
                    if (!fullUrl.startsWith('http')) {
                      fullUrl = fullUrl.startsWith('//') ? `https:${fullUrl}` : `https://chaturbate.com${fullUrl}`;
                    }
                    if (!items.some(i => i.url === fullUrl)) {
                      items.push({ url: fullUrl, isVideo: false });
                    }
                  }
                });
              }

              return items;
            });

            logger.info(`Found ${mediaItems.length} media items in photoset ${photoset.id}`);

            // Download each media item
            for (const item of mediaItems) {
              if (!personId) continue;

              try {
                if (item.isVideo) {
                  // Download video
                  const result = await ImageStorageService.downloadVideo(
                    item.url,
                    personId,
                    { maxSizeBytes: maxVideoSize, photosetId: photoset.id, title: photoset.title }
                  );

                  if (result) {
                    // Save to database
                    await ProfileImagesService.create({
                      personId,
                      filePath: result.relativePath,
                      source: 'profile',
                      mediaType: 'video',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: result.fileSize,
                      mimeType: result.mimeType,
                    });

                    profileMedia.push({
                      url: item.url,
                      localPath: result.relativePath,
                      mediaType: 'video',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: result.fileSize,
                      mimeType: result.mimeType,
                    });

                    logger.info(`Downloaded video from photoset ${photoset.id}`, { size: result.fileSize });
                  }
                } else {
                  // Download image
                  const result = await ImageStorageService.downloadProfileImage(
                    item.url,
                    personId,
                    { photosetId: photoset.id, title: photoset.title }
                  );

                  if (result) {
                    // Save to database
                    await ProfileImagesService.create({
                      personId,
                      filePath: result.relativePath,
                      source: 'profile',
                      mediaType: 'image',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: result.fileSize,
                      mimeType: result.mimeType,
                    });

                    profileMedia.push({
                      url: item.url,
                      localPath: result.relativePath,
                      mediaType: 'image',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: result.fileSize,
                      mimeType: result.mimeType,
                    });

                    logger.debug(`Downloaded image from photoset ${photoset.id}`);
                  }
                }
              } catch (downloadError) {
                logger.error(`Failed to download media from photoset ${photoset.id}`, { error: downloadError, url: item.url });
              }
            }

            // Add delay between photosets to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (photosetError) {
            logger.error(`Error scraping photoset ${photoset.id}`, { error: photosetError });
          }
        }

        // Update has_videos flag if we downloaded any videos
        if (personId && profileMedia.some(m => m.mediaType === 'video')) {
          await ProfileImagesService.updateHasVideosFlag(personId);
        }
      }

      profileData.profileMedia = profileMedia;

      logger.info(`Successfully scraped profile for ${username}`, {
        isOnline,
        hasBio: !!profileData.bio,
        photoCount: profileData.photos.length,
        photosetCount: profileData.photosets?.length || 0,
        mediaDownloaded: profileMedia.length,
        videosDownloaded: profileMedia.filter(m => m.mediaType === 'video').length,
        tagCount: profileData.tags.length,
        socialLinkCount: profileData.socialLinks.length,
      });

      return profileData;
    } catch (error) {
      logger.error('Error scraping profile', { error, username });
      return null;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Scrape multiple profiles with rate limiting
   */
  static async scrapeProfiles(
    usernames: string[],
    options?: {
      delayMs?: number;
      onProgress?: (completed: number, total: number, username: string) => void;
    }
  ): Promise<Map<string, ScrapedProfileData | null>> {
    const { delayMs = 3000, onProgress } = options || {};
    const results = new Map<string, ScrapedProfileData | null>();

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];

      try {
        const profile = await this.scrapeProfile(username);
        results.set(username, profile);

        if (onProgress) {
          onProgress(i + 1, usernames.length, username);
        }
      } catch (error) {
        logger.error(`Failed to scrape profile for ${username}`, { error });
        results.set(username, null);
      }

      // Delay between requests to avoid rate limiting
      if (i < usernames.length - 1) {
        const randomDelay = delayMs + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
    }

    return results;
  }
}
