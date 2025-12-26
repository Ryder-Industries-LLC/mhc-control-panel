import { Router, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { FollowerScraperService } from '../services/follower-scraper.service.js';
import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';

const router = Router();

/**
 * POST /api/followers/update-following
 * Accept HTML from followed-cams page OR array of usernames and update following list
 */
router.post('/update-following', async (req: Request, res: Response) => {
  try {
    const { html, usernames: providedUsernames } = req.body;

    let usernames: string[];

    if (providedUsernames && Array.isArray(providedUsernames)) {
      // Accept direct usernames array (from local parsing)
      usernames = providedUsernames.map((u: string) => u.toLowerCase());
    } else if (html && typeof html === 'string') {
      // Parse HTML to extract usernames
      usernames = FollowerScraperService.parseFollowingHTML(html);
    } else {
      return res.status(400).json({ error: 'HTML content or usernames array required' });
    }

    const stats = await FollowerScraperService.updateFollowing(usernames);

    logger.info('Following list updated via API', stats);

    res.json({
      success: true,
      stats,
      usernames,
    });
  } catch (error) {
    logger.error('Error updating following list', { error });
    res.status(500).json({ error: 'Failed to update following list' });
  }
});

/**
 * POST /api/followers/update-followers
 * Accept HTML from followers page OR array of usernames and update followers list
 */
router.post('/update-followers', async (req: Request, res: Response) => {
  try {
    const { html, usernames: providedUsernames } = req.body;

    let usernames: string[];

    if (providedUsernames && Array.isArray(providedUsernames)) {
      // Accept direct usernames array (from local parsing)
      usernames = providedUsernames.map((u: string) => u.toLowerCase());
    } else if (html && typeof html === 'string') {
      // Parse HTML to extract usernames
      usernames = FollowerScraperService.parseFollowersHTML(html);
    } else {
      return res.status(400).json({ error: 'HTML content or usernames array required' });
    }

    const stats = await FollowerScraperService.updateFollowers(usernames);

    logger.info('Followers list updated via API', stats);

    res.json({
      success: true,
      stats,
      usernames,
    });
  } catch (error) {
    logger.error('Error updating followers list', { error });
    res.status(500).json({ error: 'Failed to update followers list' });
  }
});

/**
 * GET /api/followers/following
 * Get list of users I'm following
 */
router.get('/following', async (_req: Request, res: Response) => {
  try {
    const following = await FollowerScraperService.getFollowing();
    res.json({ following, total: following.length });
  } catch (error) {
    logger.error('Error getting following list', { error });
    res.status(500).json({ error: 'Failed to get following list' });
  }
});

/**
 * GET /api/followers/followers
 * Get list of users following me
 */
router.get('/followers', async (_req: Request, res: Response) => {
  try {
    const followers = await FollowerScraperService.getFollowers();
    res.json({ followers, total: followers.length });
  } catch (error) {
    logger.error('Error getting followers list', { error });
    res.status(500).json({ error: 'Failed to get followers list' });
  }
});

/**
 * GET /api/followers/unfollowed
 * Get list of users who unfollowed me
 */
router.get('/unfollowed', async (_req: Request, res: Response) => {
  try {
    const unfollowed = await FollowerScraperService.getUnfollowed();
    res.json({ unfollowed, total: unfollowed.length });
  } catch (error) {
    logger.error('Error getting unfollowed list', { error });
    res.status(500).json({ error: 'Failed to get unfollowed list' });
  }
});

/**
 * DELETE /api/followers/clear-following
 * Clear all following records (for debugging/reset)
 */
router.delete('/clear-following', async (_req: Request, res: Response) => {
  try {
    const result = await FollowerScraperService.clearFollowing();
    logger.info('Following list cleared');
    res.json({ success: true, message: 'Following list cleared', cleared: result });
  } catch (error) {
    logger.error('Error clearing following list', { error });
    res.status(500).json({ error: 'Failed to clear following list' });
  }
});

/**
 * POST /api/followers/import-cookies
 * Import cookies from user's browser for authentication
 * This is the preferred method as it works in Docker and supports 2FA
 */
router.post('/import-cookies', async (req: Request, res: Response) => {
  try {
    const { cookies } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'Cookies array required' });
    }

    const result = await ChaturbateScraperService.setCookies(cookies);

    if (result.success) {
      logger.info('Cookies imported successfully', { count: cookies.length });
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error importing cookies', { error });
    res.status(500).json({ error: 'Failed to import cookies' });
  }
});

/**
 * GET /api/followers/cookies-status
 * Check if cookies are imported and ready for scraping
 */
router.get('/cookies-status', async (_req: Request, res: Response) => {
  try {
    const hasCookies = await ChaturbateScraperService.hasCookies();
    res.json({
      hasCookies,
      message: hasCookies
        ? 'Cookies are available - auto-scraping is ready'
        : 'No cookies imported yet - please import cookies first',
    });
  } catch (error) {
    logger.error('Error checking cookies status', { error });
    res.status(500).json({ error: 'Failed to check cookies status' });
  }
});

/**
 * POST /api/followers/login
 * Open browser for manual login (handles 2FA)
 * NOTE: This will not work in Docker containers without X11 forwarding
 * Use cookie import instead
 * @deprecated Use /import-cookies instead
 */
router.post('/login', async (_req: Request, res: Response) => {
  try {
    logger.info('Opening browser for manual login...');
    const result = await ChaturbateScraperService.openLoginBrowser();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error opening login browser', { error });
    res.status(500).json({ error: 'Failed to open login browser' });
  }
});

/**
 * POST /api/followers/scrape-following
 * Automatically scrape following list using Puppeteer
 * NOTE: You must use /api/followers/login first to authenticate
 */
router.post('/scrape-following', async (_req: Request, res: Response) => {
  try {
    logger.info('Starting automated following scrape...');

    // Scrape following list
    const scrapeResult = await ChaturbateScraperService.scrapeFollowing();

    if (!scrapeResult.success) {
      return res.status(500).json({
        error: scrapeResult.error || 'Failed to scrape following list',
      });
    }

    // Update database with scraped usernames
    const stats = await FollowerScraperService.updateFollowing(scrapeResult.usernames);

    logger.info('Following list updated via automated scraping', stats);

    res.json({
      success: true,
      stats,
      usernames: scrapeResult.usernames,
    });
  } catch (error) {
    logger.error('Error in automated following scrape', { error });
    res.status(500).json({ error: 'Failed to scrape following list' });
  }
});

/**
 * POST /api/followers/scrape-followers
 * Automatically scrape followers list using Puppeteer
 * NOTE: You must use /api/followers/login first to authenticate
 */
router.post('/scrape-followers', async (_req: Request, res: Response) => {
  try {
    logger.info('Starting automated followers scrape...');

    // Scrape followers list
    const scrapeResult = await ChaturbateScraperService.scrapeFollowers();

    if (!scrapeResult.success) {
      return res.status(500).json({
        error: scrapeResult.error || 'Failed to scrape followers list',
      });
    }

    // Update database with scraped usernames
    const stats = await FollowerScraperService.updateFollowers(scrapeResult.usernames);

    logger.info('Followers list updated via automated scraping', stats);

    res.json({
      success: true,
      stats,
      usernames: scrapeResult.usernames,
    });
  } catch (error) {
    logger.error('Error in automated followers scrape', { error });
    res.status(500).json({ error: 'Failed to scrape followers list' });
  }
});

export default router;
