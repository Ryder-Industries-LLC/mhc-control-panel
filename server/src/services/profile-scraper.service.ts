// @ts-nocheck - Browser context code uses DOM APIs
import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../config/logger.js';

export interface ChaturbateProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  sexualOrientation: string | null;
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
    isPrimary: boolean;
  }[];
  tipMenu: {
    item: string;
    tokens: number;
  }[];
  goalDescription: string | null;
  goalTokens: number | null;
  goalProgress: number | null;
  socialLinks: {
    platform: string;
    url: string;
  }[];
  fanclubPrice: number | null;
  fanclubCount: number | null;
  lastBroadcast: Date | null;
  scrapedAt: Date;
}

export class ProfileScraperService {
  private static browser: Browser | null = null;

  /**
   * Initialize browser instance
   */
  private static async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      logger.info('Launching Puppeteer browser...');
      this.browser = await puppeteer.launch({
        headless: true,
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
   * Scrape Chaturbate broadcaster profile
   */
  static async scrapeProfile(username: string): Promise<ChaturbateProfile | null> {
    const url = `https://chaturbate.com/${username}/`;
    let page: Page | null = null;

    try {
      logger.info(`Scraping profile for ${username}`);

      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to profile
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Check if profile exists (404 or banned)
      const content = await page.content();
      if (content.includes('Page Not Found') || content.includes('This account has been disabled')) {
        logger.warn(`Profile not found or disabled: ${username}`);
        return null;
      }

      // Extract profile data using page.evaluate
      // The function passed to evaluate runs in the browser context
      const profile = await page.evaluate((username: string) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - document is available in browser context
        const data: any = {
          username,
          scrapedAt: new Date(),
        };

        // Helper function to get text content
        const getText = (selector: string): string | null => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || null;
        };

        // Helper function to get attribute
        const getAttr = (selector: string, attr: string): string | null => {
          const el = document.querySelector(selector);
          return el?.getAttribute(attr) || null;
        };

        // Display name
        data.displayName = getText('.title a') || getText('h1');

        // Bio
        data.bio = getText('.bio') || getText('.description');

        // Profile info - these selectors may need adjustment based on actual HTML
        const infoItems = document.querySelectorAll('.info-item, .profile-info-item');
        infoItems.forEach((item: any) => {
          const label = item.querySelector('.label')?.textContent?.trim().toLowerCase() || '';
          const value = item.querySelector('.value')?.textContent?.trim() || '';

          if (label.includes('location')) data.location = value;
          if (label.includes('age')) data.age = parseInt(value, 10) || null;
          if (label.includes('gender')) data.gender = value;
          if (label.includes('sexual orientation')) data.sexualOrientation = value;
          if (label.includes('interested in')) data.interestedIn = value;
          if (label.includes('body type')) data.bodyType = value;
          if (label.includes('ethnicity')) data.ethnicity = value;
          if (label.includes('hair')) data.hairColor = value;
          if (label.includes('eye')) data.eyeColor = value;
          if (label.includes('height')) data.height = value;
          if (label.includes('weight')) data.weight = value;
        });

        // Languages
        const langElements = document.querySelectorAll('.language, [data-language]');
        data.languages = Array.from(langElements)
          .map((el: any) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Tags
        const tagElements = document.querySelectorAll('.tag, .room-tag, [data-tag]');
        data.tags = Array.from(tagElements)
          .map((el: any) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Photos
        const photoElements = document.querySelectorAll('.profile-photo img, .photo-gallery img');
        data.photos = Array.from(photoElements).map((img: any, idx: number) => ({
          url: img.getAttribute('src') || '',
          isPrimary: idx === 0,
        }));

        // Tip menu
        const tipMenuItems = document.querySelectorAll('.tip-menu-item, [data-tip-menu-item]');
        data.tipMenu = Array.from(tipMenuItems).map((item: any) => {
          const itemText = item.querySelector('.item-text')?.textContent?.trim() || '';
          const tokensText = item.querySelector('.tokens')?.textContent?.trim() || '0';
          return {
            item: itemText,
            tokens: parseInt(tokensText.replace(/[^\d]/g, ''), 10) || 0,
          };
        });

        // Goal information
        data.goalDescription = getText('.goal-description, .room-goal');
        const goalTokensText = getText('.goal-tokens, .tokens-remaining');
        data.goalTokens = goalTokensText ? parseInt(goalTokensText.replace(/[^\d]/g, ''), 10) : null;
        const goalProgressText = getText('.goal-progress, .progress-percent');
        data.goalProgress = goalProgressText ? parseInt(goalProgressText.replace(/[^\d]/g, ''), 10) : null;

        // Social links
        const socialLinks = document.querySelectorAll('a[href*="twitter"], a[href*="instagram"], a[href*="onlyfans"]');
        data.socialLinks = Array.from(socialLinks).map((link: any) => {
          const href = link.getAttribute('href') || '';
          let platform = 'other';
          if (href.includes('twitter')) platform = 'twitter';
          if (href.includes('instagram')) platform = 'instagram';
          if (href.includes('onlyfans')) platform = 'onlyfans';
          return { platform, url: href };
        });

        // Fanclub info
        const fanclubPriceText = getText('.fanclub-price, .fan-club-price');
        data.fanclubPrice = fanclubPriceText ? parseInt(fanclubPriceText.replace(/[^\d]/g, ''), 10) : null;
        const fanclubCountText = getText('.fanclub-count, .fan-club-members');
        data.fanclubCount = fanclubCountText ? parseInt(fanclubCountText.replace(/[^\d]/g, ''), 10) : null;

        // Last broadcast - try to find timestamp
        const lastBroadcastText = getText('.last-broadcast, .last-online');
        if (lastBroadcastText) {
          // This would need parsing based on format like "2 hours ago", "Yesterday", etc.
          // For now, we'll leave it as null and rely on API data
          data.lastBroadcast = null;
        }

        return data;
      }, username);

      // Fill in the scrapedAt timestamp
      profile.scrapedAt = new Date();

      logger.info(`Successfully scraped profile for ${username}`, {
        hasBio: !!profile.bio,
        photoCount: profile.photos?.length || 0,
        tagCount: profile.tags?.length || 0,
      });

      return profile;
    } catch (error) {
      logger.error('Error scraping profile', { error, username, url });
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
      delayMs?: number; // Delay between requests
      maxConcurrent?: number; // Max concurrent scrapes
    }
  ): Promise<Map<string, ChaturbateProfile | null>> {
    const { delayMs = 2000, maxConcurrent = 3 } = options || {};
    const results = new Map<string, ChaturbateProfile | null>();

    // Process in batches
    for (let i = 0; i < usernames.length; i += maxConcurrent) {
      const batch = usernames.slice(i, i + maxConcurrent);

      const batchResults = await Promise.all(
        batch.map(async (username) => {
          const profile = await this.scrapeProfile(username);
          return { username, profile };
        })
      );

      batchResults.forEach(({ username, profile }) => {
        results.set(username, profile);
      });

      // Delay between batches
      if (i + maxConcurrent < usernames.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
