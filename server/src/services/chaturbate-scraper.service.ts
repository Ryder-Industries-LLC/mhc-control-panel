// @ts-nocheck - Browser context code uses DOM APIs in page.evaluate
import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../config/logger.js';
import { FollowerScraperService } from './follower-scraper.service.js';
import { ProfileImagesService } from './profile-images.service.js';
import { storageService } from './storage/storage.service.js';
import { query } from '../db/client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';
import axios from 'axios';
import crypto from 'crypto';

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
  bodyDecorations: string | null;
  smokeDrink: string | null;
  birthdayPublic: string | null;
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
  detectedFollowStatus: 'following' | 'not_following' | 'unknown';
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

      // Detect follow status by checking VISIBILITY of profile-specific buttons
      // Both buttons exist in DOM but only one is visible at a time (display: inline vs none)
      const detectedFollowStatus = await page.evaluate(() => {
        // Get profile-specific follow/unfollow buttons
        const unfollowBtn = document.querySelector('div.unfollowButton[data-testid="unfollow-button"]');
        const followBtn = document.querySelector('div.followButton[data-testid="follow-button"]');

        // Helper to check computed display style
        const getDisplay = (el: Element | null): string => {
          if (!el) return 'none';
          const style = window.getComputedStyle(el);
          return style.display || 'none';
        };

        const unfollowDisplay = getDisplay(unfollowBtn);
        const followDisplay = getDisplay(followBtn);

        // Only trust visible buttons (display !== 'none')
        if (unfollowDisplay !== 'none' && unfollowDisplay !== '') {
          return 'following';
        }
        if (followDisplay !== 'none' && followDisplay !== '') {
          return 'not_following';
        }

        // Fallback: check inline style attribute if computed style fails
        const unfollowStyle = unfollowBtn?.getAttribute('style') || '';
        const followStyle = followBtn?.getAttribute('style') || '';

        if (unfollowStyle.includes('display: inline') || unfollowStyle.includes('display:inline')) {
          return 'following';
        }
        if (followStyle.includes('display: inline') || followStyle.includes('display:inline')) {
          return 'not_following';
        }

        // Cannot confidently determine - return unknown
        return 'unknown';
      }) as 'following' | 'not_following' | 'unknown';

      logger.info(`Detected follow status for ${username}: ${detectedFollowStatus}`);

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
          bodyDecorations: null,
          smokeDrink: null,
          birthdayPublic: null,
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

        // Extract profile details from bio tab using data-testid attributes
        // Real Name (this is what displays as "Display Name" in Profile Details)
        data.displayName = getText('[data-testid="bio-tab-real-name-value"]');

        // Location
        data.location = getText('[data-testid="bio-tab-location-value"]');

        // Age
        const ageText = getText('[data-testid="bio-tab-age-value"]');
        if (ageText) {
          data.age = parseInt(ageText, 10) || null;
        }

        // Gender (I Am field)
        data.gender = getText('[data-testid="bio-tab-i-am-value"]');

        // Interested In
        data.interestedIn = getText('[data-testid="bio-tab-interested-in-value"]');

        // Body Type
        data.bodyType = getText('[data-testid="bio-tab-body-type-value"]');

        // Body Decorations
        data.bodyDecorations = getText('[data-testid="bio-tab-body-decorations-value"]');

        // Smoke/Drink
        data.smokeDrink = getText('[data-testid="bio-tab-smoke-drink-value"]');

        // Birthday (public)
        data.birthdayPublic = getText('[data-testid="bio-tab-birth-date-value"]');

        // Languages
        const languagesText = getText('[data-testid="bio-tab-language-value"]');
        if (languagesText) {
          data.languages = languagesText.split(',').map((l: string) => l.trim()).filter(Boolean);
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
        const socialPatterns = ['twitter', 'x.com', 'instagram', 'onlyfans', 'fansly', 'snapchat', 'tiktok', 'amazon', 'wishlist', 'telegram', 'alllinks', 'allmylinks', 'linktree', 'throne', 'whatsapp', 'fanvue', 'manyvids', 'pornhub', 'xvideos'];
        const socialLinks = document.querySelectorAll('[data-testid="social-media-item"]');
        socialLinks.forEach((link: any) => {
          const href = link.getAttribute('href') || '';

          // Skip locked links (href starts with /socials/social_media)
          if (href.startsWith('/socials/social_media')) {
            return; // Locked link, skip
          }

          // Extract and decode URL from /external_link/?url=... format
          let actualUrl = href;
          if (href.includes('/external_link/')) {
            try {
              const urlMatch = href.match(/[?&]url=([^&]+)/);
              if (urlMatch) {
                actualUrl = decodeURIComponent(urlMatch[1]);
              }
            } catch (e) {
              // If decode fails, use original href
            }
          }

          const urlLower = actualUrl.toLowerCase();

          // Filter out Chaturbate's own accounts and internal links
          if (urlLower.includes('twitter.com/cbupdatenews') ||
              urlLower.includes('twitter.com/chaturbate') ||
              urlLower.includes('x.com/cbupdatenews') ||
              urlLower.includes('x.com/chaturbate') ||
              urlLower.includes('chaturbate.com/')) {
            return; // Skip Chaturbate's own accounts and internal links
          }

          // Remove trailing slashes from URLs
          actualUrl = actualUrl.replace(/\/+$/, '');

          for (const pattern of socialPatterns) {
            if (urlLower.includes(pattern)) {
              data.socialLinks.push({
                platform: pattern === 'x.com' ? 'twitter' : pattern,
                url: actualUrl,
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
      profileData.detectedFollowStatus = detectedFollowStatus;

      // NOTE: We no longer download profile page photos here.
      // The profile page shows thumbnails of photoset images, which are downloaded
      // in full size from the photoset detail pages below (with proper database tracking).
      // Downloading here would create duplicates - same images saved twice to S3.
      // The profileData.photos array keeps URLs for reference in the profiles.photos JSON column.
      // Set localPath to null since we're not downloading here.
      profileData.photos = profileData.photos.map(photo => ({
        ...photo,
        localPath: null,
      }));

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
            // Check if we've already downloaded this photoset or if user deleted it
            if (personId) {
              const hasPhotoset = await ProfileImagesService.hasPhotoset(personId, photoset.id);
              if (hasPhotoset) {
                logger.debug(`Photoset ${photoset.id} already downloaded for ${username}, skipping`);
                continue;
              }

              // Check if user previously deleted this photoset - don't re-download
              const wasDeleted = await ProfileImagesService.isPhotosetDeleted(personId, photoset.id);
              if (wasDeleted) {
                logger.debug(`Photoset ${photoset.id} was deleted by user for ${username}, skipping`);
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
            // For photosets with multiple images, we need to click through each thumbnail
            // to get the full-size image URL
            const mediaItems: { url: string; isVideo: boolean }[] = [];

            // First check if this is a video
            const videoUrl = await page.evaluate(() => {
              const videoEl = document.querySelector('[data-testid="user-video"]') as HTMLVideoElement;
              if (videoEl && videoEl.src) {
                return videoEl.src;
              }
              const allVideos = document.querySelectorAll('video');
              for (const video of allVideos) {
                if (video.src && video.src.includes('highwebmedia.com')) {
                  return video.src;
                }
                const source = video.querySelector('source');
                if (source) {
                  const src = source.src || source.getAttribute('src');
                  if (src && src.includes('highwebmedia.com')) {
                    return src;
                  }
                }
              }
              return null;
            });

            if (videoUrl) {
              mediaItems.push({ url: videoUrl, isVideo: true });
            } else {
              // This is a photo photoset - use arrow navigation to click through all images
              // Chaturbate photosets show one image at a time with left/right arrow navigation

              // Helper function to extract the current main image URL
              const extractMainImageUrl = async (): Promise<string | null> => {
                return await page.evaluate(() => {
                  // Look for images from CDN that are large enough to be main images
                  const allImages = document.querySelectorAll('img');
                  for (const img of allImages) {
                    const src = img.getAttribute('src') || '';
                    // Main images are from highwebmedia.com and not thumbnails
                    // Thumbnails typically have _100x100_cropped, _150x100, _s., _t. in URL
                    if (src.includes('highwebmedia.com') &&
                        !src.includes('_100x100') &&
                        !src.includes('150x100') &&
                        !src.includes('_s.') &&
                        !src.includes('_t.') &&
                        !src.includes('_cropped')) {
                      const rect = img.getBoundingClientRect();
                      // Only consider reasonably sized images (not tiny thumbnails)
                      if (rect.width > 200 && rect.height > 200) {
                        return src.startsWith('http') ? src : `https:${src}`;
                      }
                    }
                  }
                  return null;
                });
              };

              // Check if right arrow navigation exists
              const hasRightArrow = await page.evaluate(() => {
                const rightArrow = document.querySelector('[data-testid="right-arrow"]');
                return !!rightArrow;
              });

              if (hasRightArrow) {
                // Navigate through all images using arrow clicks
                const maxImages = 50; // Safety limit
                let imageIndex = 0;
                let lastImageUrl: string | null = null;
                let consecutiveSameCount = 0;

                logger.info(`Photoset ${photoset.id} has arrow navigation, clicking through images`);

                while (imageIndex < maxImages) {
                  // Get current main image
                  const currentImageUrl = await extractMainImageUrl();

                  if (currentImageUrl) {
                    // Check if we've seen this image before (we've looped back to start)
                    if (currentImageUrl === lastImageUrl) {
                      consecutiveSameCount++;
                      if (consecutiveSameCount >= 2) {
                        logger.debug(`Detected same image twice in a row, reached end of photoset`);
                        break;
                      }
                    } else {
                      consecutiveSameCount = 0;
                    }

                    // Add if not already collected
                    if (!mediaItems.some(m => m.url === currentImageUrl)) {
                      mediaItems.push({ url: currentImageUrl, isVideo: false });
                      logger.debug(`Found image ${mediaItems.length} in photoset ${photoset.id}: ${currentImageUrl.substring(0, 80)}...`);
                    } else {
                      // We've seen this image before - likely looped back to start
                      logger.debug(`Image already collected, reached end of photoset`);
                      break;
                    }

                    lastImageUrl = currentImageUrl;
                  }

                  // Click the right arrow to go to next image
                  const clicked = await page.evaluate(() => {
                    // Find the right arrow's parent clickable element
                    const rightArrow = document.querySelector('[data-testid="right-arrow"]');
                    if (rightArrow) {
                      // The clickable area is the parent div containing the arrow
                      const clickableParent = rightArrow.closest('div[style*="cursor"]') || rightArrow.parentElement;
                      if (clickableParent) {
                        (clickableParent as HTMLElement).click();
                        return true;
                      }
                      // Fallback: try clicking the SVG itself
                      (rightArrow as HTMLElement).click();
                      return true;
                    }
                    return false;
                  });

                  if (!clicked) {
                    logger.debug(`Could not click right arrow, stopping navigation`);
                    break;
                  }

                  // Wait for the image to change
                  await new Promise(resolve => setTimeout(resolve, 800));
                  imageIndex++;
                }

                logger.info(`Collected ${mediaItems.length} images from photoset ${photoset.id} via arrow navigation`);
              } else {
                // No arrow navigation - single image photoset, just get the main image
                const mainImageUrl = await extractMainImageUrl();
                if (mainImageUrl) {
                  mediaItems.push({ url: mainImageUrl, isVideo: false });
                  logger.debug(`Single image photoset ${photoset.id}: ${mainImageUrl.substring(0, 80)}...`);
                } else {
                  // Fallback: try to get all images directly (shouldn't usually happen)
                  const imageUrls = await page.evaluate(() => {
                    const urls: string[] = [];
                    const images = document.querySelectorAll('img');
                    images.forEach((img: HTMLImageElement) => {
                      const src = img.getAttribute('src') || '';
                      if (src.includes('highwebmedia.com') &&
                          !src.includes('_100x100') &&
                          !src.includes('150x100') &&
                          !src.includes('_cropped')) {
                        const fullUrl = src.startsWith('http') ? src : `https:${src}`;
                        if (!urls.includes(fullUrl)) {
                          urls.push(fullUrl);
                        }
                      }
                    });
                    return urls;
                  });

                  for (const url of imageUrls) {
                    mediaItems.push({ url, isVideo: false });
                  }
                }
              }
            }

            logger.info(`Found ${mediaItems.length} media items in photoset ${photoset.id}`);

            // Download each media item
            for (const item of mediaItems) {
              if (!personId) continue;

              try {
                // Check if we already have this source URL for this person (prevent duplicates)
                const alreadyExists = await ProfileImagesService.hasSourceUrl(personId, item.url);
                if (alreadyExists) {
                  logger.debug(`Skipping already downloaded image: ${item.url.substring(0, 80)}...`);
                  continue;
                }

                if (item.isVideo) {
                  // Download video using axios
                  // First check file size with HEAD request
                  let fileSize = 0;
                  let mimeType = 'video/mp4';
                  try {
                    const headResponse = await axios.head(item.url, { timeout: 10000 });
                    fileSize = parseInt(headResponse.headers['content-length'] || '0', 10);
                    mimeType = headResponse.headers['content-type'] || 'video/mp4';
                    if (fileSize > maxVideoSize) {
                      logger.info(`Skipping video - exceeds max size`, {
                        personId,
                        fileSize,
                        maxSize: maxVideoSize,
                      });
                      continue;
                    }
                  } catch (headError) {
                    // Proceed with download anyway
                  }

                  const response = await axios.get(item.url, {
                    responseType: 'arraybuffer',
                    timeout: 300000, // 5 minute timeout
                    maxContentLength: maxVideoSize,
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    },
                  });

                  const actualSize = response.data.length;
                  const actualMimeType = response.headers['content-type'] || mimeType;
                  const timestamp = Date.now();
                  const hash = crypto.createHash('md5').update(item.url).digest('hex').substring(0, 8);
                  const ext = actualMimeType.includes('mp4') ? '.mp4' : actualMimeType.includes('webm') ? '.webm' : '.mp4';
                  const filename = `${timestamp}_${hash}${ext}`;

                  const result = await storageService.writeWithUsername(
                    username,
                    'profile',
                    filename,
                    Buffer.from(response.data),
                    actualMimeType
                  );

                  if (result.success) {
                    // Save to database - use actual provider from write result
                    await ProfileImagesService.create({
                      personId,
                      filePath: result.relativePath,
                      source: 'profile',
                      mediaType: 'video',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: actualSize,
                      mimeType: actualMimeType,
                      username,
                      storageProvider: result.provider || 's3',
                      sourceUrl: item.url,
                    });

                    profileMedia.push({
                      url: item.url,
                      localPath: result.relativePath,
                      mediaType: 'video',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: actualSize,
                      mimeType: actualMimeType,
                    });

                    logger.info(`Downloaded video from photoset ${photoset.id}`, { size: actualSize });
                  }
                } else {
                  // Download image using axios
                  const response = await axios.get(item.url, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    },
                  });

                  // Skip placeholder images and thumbnails
                  // Placeholder images are around 5045 bytes
                  // Navigation thumbnails are typically 2-5 KB
                  // Real photoset images are much larger (50KB+)
                  const MIN_IMAGE_SIZE = 10 * 1024; // 10KB minimum
                  if (response.data.length < MIN_IMAGE_SIZE) {
                    logger.debug(`Skipping small image (likely thumbnail): ${response.data.length} bytes`);
                    continue;
                  }

                  const mimeType = response.headers['content-type'] || 'image/jpeg';
                  const timestamp = Date.now();
                  const hash = crypto.createHash('md5').update(item.url).digest('hex').substring(0, 8);
                  const ext = mimeType.includes('png') ? '.png' : mimeType.includes('gif') ? '.gif' : '.jpg';
                  const filename = `${timestamp}_${hash}${ext}`;

                  const result = await storageService.writeWithUsername(
                    username,
                    'profile',
                    filename,
                    Buffer.from(response.data),
                    mimeType
                  );

                  if (result.success) {
                    // Save to database - use actual provider from write result
                    await ProfileImagesService.create({
                      personId,
                      filePath: result.relativePath,
                      source: 'profile',
                      mediaType: 'image',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: response.data.length,
                      mimeType,
                      username,
                      storageProvider: result.provider || 's3',
                      sourceUrl: item.url,
                    });

                    profileMedia.push({
                      url: item.url,
                      localPath: result.relativePath,
                      mediaType: 'image',
                      photosetId: photoset.id,
                      title: photoset.title,
                      fileSize: response.data.length,
                      mimeType,
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
