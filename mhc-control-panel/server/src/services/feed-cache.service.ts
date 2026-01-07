import { OnlineRoom } from '../api/chaturbate/affiliate-client.js';
import { logger } from '../config/logger.js';

/**
 * Feed cache structure
 */
export interface FeedCache {
  timestamp: Date;
  totalCount: number;
  rooms: OnlineRoom[];
  roomsByUsername: Map<string, OnlineRoom>;
}

/**
 * In-memory cache for the complete Affiliate API feed
 * Stores a point-in-time snapshot of all online rooms
 */
export class FeedCacheService {
  private cache: FeedCache | null = null;
  private readonly MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Store the complete feed
   */
  setFeed(rooms: OnlineRoom[], totalCount: number): void {
    const roomsByUsername = new Map<string, OnlineRoom>();

    for (const room of rooms) {
      roomsByUsername.set(room.username.toLowerCase(), room);
    }

    this.cache = {
      timestamp: new Date(),
      totalCount,
      rooms,
      roomsByUsername,
    };

    logger.info('Feed cache updated', {
      roomCount: rooms.length,
      totalCount,
      timestamp: this.cache.timestamp,
    });
  }

  /**
   * Get the complete feed
   */
  getFeed(): FeedCache | null {
    if (!this.cache) {
      return null;
    }

    // Check if cache is stale
    if (this.isCacheStale()) {
      logger.warn('Feed cache is stale', {
        age: Date.now() - this.cache.timestamp.getTime(),
        maxAge: this.MAX_CACHE_AGE_MS,
      });
      return null;
    }

    return this.cache;
  }

  /**
   * Find a room by username in the cached feed
   */
  findRoom(username: string): OnlineRoom | null {
    if (!this.cache || this.isCacheStale()) {
      return null;
    }

    return this.cache.roomsByUsername.get(username.toLowerCase()) || null;
  }

  /**
   * Find multiple rooms by usernames
   */
  findRooms(usernames: string[]): Map<string, OnlineRoom> {
    const results = new Map<string, OnlineRoom>();

    if (!this.cache || this.isCacheStale()) {
      return results;
    }

    for (const username of usernames) {
      const room = this.cache.roomsByUsername.get(username.toLowerCase());
      if (room) {
        results.set(username.toLowerCase(), room);
      }
    }

    return results;
  }

  /**
   * Check if cache exists and is fresh
   */
  isCacheFresh(): boolean {
    return this.cache !== null && !this.isCacheStale();
  }

  /**
   * Check if cache is stale
   */
  private isCacheStale(): boolean {
    if (!this.cache) {
      return true;
    }

    const age = Date.now() - this.cache.timestamp.getTime();
    return age > this.MAX_CACHE_AGE_MS;
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAge(): number | null {
    if (!this.cache) {
      return null;
    }

    return Date.now() - this.cache.timestamp.getTime();
  }

  /**
   * Get cache metadata
   */
  getCacheMetadata(): {
    exists: boolean;
    fresh: boolean;
    timestamp: Date | null;
    ageMs: number | null;
    roomCount: number;
    totalCount: number;
  } {
    if (!this.cache) {
      return {
        exists: false,
        fresh: false,
        timestamp: null,
        ageMs: null,
        roomCount: 0,
        totalCount: 0,
      };
    }

    return {
      exists: true,
      fresh: this.isCacheFresh(),
      timestamp: this.cache.timestamp,
      ageMs: this.getCacheAge(),
      roomCount: this.cache.rooms.length,
      totalCount: this.cache.totalCount,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache = null;
    logger.info('Feed cache cleared');
  }
}

// Export singleton instance
export const feedCacheService = new FeedCacheService();
