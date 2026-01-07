import * as fs from 'fs';
import * as path from 'path';
import { load, type CheerioAPI } from 'cheerio';

/**
 * Follow Detection Regression Tests
 *
 * These tests verify that the profile scrape follow detection:
 * 1. Correctly detects follow status based on button VISIBILITY (not just existence)
 * 2. Does NOT use global UI elements as evidence (followed_text, followed_tab, etc.)
 * 3. Returns 'unknown' when buttons cannot be confidently determined
 */

// The actual detection logic extracted from chaturbate-scraper.service.ts
// Adapted for Cheerio (server-side DOM parsing)
function detectFollowStatus($: CheerioAPI): 'following' | 'not_following' | 'unknown' {
  // Get profile-specific follow/unfollow buttons
  const unfollowBtn = $('div.unfollowButton[data-testid="unfollow-button"]');
  const followBtn = $('div.followButton[data-testid="follow-button"]');

  // Helper to extract display from inline style
  const getDisplay = (el: ReturnType<CheerioAPI>): string => {
    if (el.length === 0) return 'none';
    const inlineStyle = el.attr('style') || '';

    // Extract display from inline style
    const displayMatch = inlineStyle.match(/display:\s*([^;]+)/);
    if (displayMatch) {
      return displayMatch[1].trim();
    }

    return 'none';
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

  // Fallback: check inline style attribute directly
  const unfollowStyle = unfollowBtn.attr('style') || '';
  const followStyle = followBtn.attr('style') || '';

  if (unfollowStyle.includes('display: inline') || unfollowStyle.includes('display:inline')) {
    return 'following';
  }
  if (followStyle.includes('display: inline') || followStyle.includes('display:inline')) {
    return 'not_following';
  }

  // Cannot confidently determine - return unknown
  return 'unknown';
}

// Load HTML fixture files
const fixturesDir = path.join(__dirname, '../../src/services/__tests__/fixtures');

function loadFixture(filename: string): CheerioAPI {
  const filepath = path.join(fixturesDir, filename);
  const html = fs.readFileSync(filepath, 'utf-8');
  return load(html);
}

describe('Follow Detection', () => {
  describe('Profile-specific button detection', () => {
    it('should detect is_following = true for cb-followed-online.html', () => {
      const $ = loadFixture('cb-followed-online.html');
      const status = detectFollowStatus($);
      expect(status).toBe('following');
    });

    it('should detect is_following = true for cb-followed-offline.html', () => {
      const $ = loadFixture('cb-followed-offline.html');
      const status = detectFollowStatus($);
      expect(status).toBe('following');
    });

    it('should detect is_following = false for cb-not-followed-online.html', () => {
      const $ = loadFixture('cb-not-followed-online.html');
      const status = detectFollowStatus($);
      expect(status).toBe('not_following');
    });

    it('should detect is_following = false for cb-not-followed-offline.html', () => {
      const $ = loadFixture('cb-not-followed-offline.html');
      const status = detectFollowStatus($);
      expect(status).toBe('not_following');
    });
  });

  describe('Global UI elements should NOT be used as evidence', () => {
    it('should not treat #followed_tab as evidence', () => {
      // All fixtures have #followed_tab (the FOLLOWING nav tab), but this should NOT
      // affect the follow status detection
      const $followed = loadFixture('cb-followed-online.html');
      const $notFollowed = loadFixture('cb-not-followed-online.html');

      // Both pages have the global FOLLOWING tab
      expect($followed('#followed_tab').length).toBeGreaterThan(0);
      expect($notFollowed('#followed_tab').length).toBeGreaterThan(0);

      // But detection should still differ based on profile-specific buttons
      expect(detectFollowStatus($followed)).toBe('following');
      expect(detectFollowStatus($notFollowed)).toBe('not_following');
    });

    it('should not treat .followed_text as evidence', () => {
      const $followed = loadFixture('cb-followed-online.html');
      const $notFollowed = loadFixture('cb-not-followed-online.html');

      // Both pages have the global FOLLOWING text in header
      expect($followed('.followed_text').length).toBeGreaterThan(0);
      expect($notFollowed('.followed_text').length).toBeGreaterThan(0);

      // But detection should still differ
      expect(detectFollowStatus($followed)).toBe('following');
      expect(detectFollowStatus($notFollowed)).toBe('not_following');
    });

    it('should not treat [data-testid="following-tab"] as evidence', () => {
      const $followed = loadFixture('cb-followed-online.html');
      const $notFollowed = loadFixture('cb-not-followed-online.html');

      // Both pages have the following tab testid
      expect($followed('[data-testid="following-tab"]').length).toBeGreaterThan(0);
      expect($notFollowed('[data-testid="following-tab"]').length).toBeGreaterThan(0);

      // But detection should still differ
      expect(detectFollowStatus($followed)).toBe('following');
      expect(detectFollowStatus($notFollowed)).toBe('not_following');
    });
  });

  describe('Button visibility detection', () => {
    it('should return unknown when no buttons are found', () => {
      const $ = load('<html><body><div>No buttons here</div></body></html>');
      const status = detectFollowStatus($);
      expect(status).toBe('unknown');
    });

    it('should return unknown when both buttons have display: none', () => {
      const html = `
        <html><body>
          <div class="followButton" data-testid="follow-button" style="display: none;">Follow</div>
          <div class="unfollowButton" data-testid="unfollow-button" style="display: none;">Unfollow</div>
        </body></html>
      `;
      const $ = load(html);
      const status = detectFollowStatus($);
      expect(status).toBe('unknown');
    });

    it('should detect following when unfollowButton is visible', () => {
      const html = `
        <html><body>
          <div class="followButton" data-testid="follow-button" style="display: none;">Follow</div>
          <div class="unfollowButton" data-testid="unfollow-button" style="display: inline;">Unfollow</div>
        </body></html>
      `;
      const $ = load(html);
      const status = detectFollowStatus($);
      expect(status).toBe('following');
    });

    it('should detect not_following when followButton is visible', () => {
      const html = `
        <html><body>
          <div class="followButton" data-testid="follow-button" style="display: inline;">Follow</div>
          <div class="unfollowButton" data-testid="unfollow-button" style="display: none;">Unfollow</div>
        </body></html>
      `;
      const $ = load(html);
      const status = detectFollowStatus($);
      expect(status).toBe('not_following');
    });
  });
});
