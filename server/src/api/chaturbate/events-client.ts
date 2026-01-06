import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PersonService } from '../../services/person.service.js';
import { InteractionService } from '../../services/interaction.service.js';
import { SessionService } from '../../services/session.service.js';
import { SessionStitcherService } from '../../services/session-stitcher.service.js';
import { RoomVisitsService } from '../../services/room-visits.service.js';
import { RoomPresenceService } from '../../services/room-presence.service.js';
import { FollowHistoryService } from '../../services/follow-history.service.js';
import { query } from '../../db/client.js';

// Event type definitions based on CHATURBATE_EVENTS_API.md
export interface ChaturbateEvent {
  method:
    | 'broadcastStart'
    | 'broadcastStop'
    | 'chatMessage'
    | 'privateMessage'
    | 'tip'
    | 'follow'
    | 'unfollow'
    | 'userEnter'
    | 'userLeave'
    | 'fanclubJoin'
    | 'mediaPurchase'
    | 'roomSubjectChange';
  // Top-level broadcaster field - indicates whose room the event occurred in
  broadcaster?: string;
  object: {
    user?: {
      username: string;
      inFanclub?: boolean;
      hasTipped?: boolean;
      isMod?: boolean;
      [key: string]: unknown;
    };
    message?: {
      message: string;
      [key: string]: unknown;
    };
    tip?: {
      tokens: number;
      message?: string;
      isAnon?: boolean;
      [key: string]: unknown;
    };
    broadcaster?: {
      username: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export class ChaturbateEventsClient {
  private client: AxiosInstance;
  private isRunning = false;
  private currentSessionId: string | null = null;
  private nextUrl: string | null = null;

  constructor(
    private token: string = env.CHATURBATE_EVENTS_TOKEN,
    private username: string = env.CHATURBATE_USERNAME
  ) {
    this.client = axios.create({
      baseURL: 'https://eventsapi.chaturbate.com',
      timeout: 120000, // 2 minutes for longpoll
    });

    // Initialize nextUrl with the initial endpoint
    this.nextUrl = `https://eventsapi.chaturbate.com/events/${this.username}/${this.token}/?timeout=30`;
  }

  /**
   * Start listening to events (longpoll loop)
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Events listener already running');
      return;
    }

    // Try to recover existing session on startup
    // This handles the case where the app restarts while streaming
    try {
      const existingSession = await SessionService.getCurrentSession(this.username);
      if (existingSession) {
        this.currentSessionId = existingSession.id;
        logger.info(`Recovered existing session on startup: ${existingSession.id}`);
      }
    } catch (error) {
      logger.warn('Failed to check for existing session on startup', { error });
    }

    this.isRunning = true;
    logger.info('Starting Chaturbate Events API listener');

    while (this.isRunning) {
      try {
        await this.poll();
      } catch (error) {
        logger.error('Events polling error', { error });
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Stop listening
   */
  stop() {
    this.isRunning = false;
    logger.info('Stopping Chaturbate Events API listener');
  }

  /**
   * Single poll cycle
   * Follows the longpoll pattern from EVENTS_API_DOCS.md
   */
  private async poll() {
    if (!this.nextUrl) {
      logger.error('No nextUrl available for polling');
      this.stop();
      return;
    }

    try {
      const response = await this.client.get<{
        events: ChaturbateEvent[];
        nextUrl: string;
      }>(this.nextUrl);

      // Update nextUrl for the next poll
      this.nextUrl = response.data.nextUrl;

      // Process events
      if (response.data.events && response.data.events.length > 0) {
        logger.info(`Received ${response.data.events.length} events`);
        for (const event of response.data.events) {
          await this.handleEvent(event);
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          // Timeout is expected for longpoll, continue
          logger.debug('Longpoll timeout, continuing...');
          return;
        }
        if (error.response?.status === 400) {
          logger.error('Events API returned 400 Bad Request - token is likely expired or invalid. Generate a new token at https://chaturbate.com/statsapi/authtoken/ (select Events API scope) and update CHATURBATE_EVENTS_TOKEN in .env');
          // Don't stop - keep retrying in case token gets updated
          return;
        }
        if (error.response?.status === 401) {
          logger.error('Events API authentication failed - check token at https://chaturbate.com/statsapi/authtoken/');
          this.stop();
          return;
        }
        if (error.response?.status === 404) {
          logger.error('Events API endpoint not found - check username/token');
          this.stop();
          return;
        }
      }
      throw error;
    }
  }

  /**
   * Log event to database with deduplication
   * Stores the COMPLETE raw event for debugging/audit purposes
   */
  private async logEvent(event: ChaturbateEvent) {
    try {
      // Use top-level broadcaster from API, fall back to our username
      const broadcaster = event.broadcaster || this.username;
      const username = event.object.user?.username || broadcaster;

      logger.info('Logging event to database', {
        method: event.method,
        broadcaster,
        username,
      });

      // Use INSERT with conflict detection to prevent duplicates
      // Duplicates are same method + username within the same minute
      // Store the COMPLETE raw event (including top-level fields like broadcaster)
      await query(
        `INSERT INTO event_logs (method, broadcaster, username, raw_event)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM event_logs
           WHERE method = $1
             AND username = $3
             AND created_at >= DATE_TRUNC('minute', NOW())
             AND created_at < DATE_TRUNC('minute', NOW()) + INTERVAL '1 minute'
         )`,
        [event.method, broadcaster, username, JSON.stringify(event)]
      );

      logger.info('Event logged successfully', { method: event.method });
    } catch (error) {
      logger.error('Failed to log event', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        event: event.method
      });
    }
  }

  /**
   * Handle a single event
   */
  private async handleEvent(event: ChaturbateEvent) {
    try {
      logger.debug(`Received event: ${event.method}`, { event });

      // Log all events to database
      await this.logEvent(event);

      switch (event.method) {
        case 'broadcastStart':
          await this.handleBroadcastStart(event);
          break;
        case 'broadcastStop':
          await this.handleBroadcastStop(event);
          break;
        case 'chatMessage':
          await this.handleChatMessage(event);
          break;
        case 'privateMessage':
          await this.handlePrivateMessage(event);
          break;
        case 'tip':
          await this.handleTip(event);
          break;
        case 'follow':
          await this.handleFollow(event);
          break;
        case 'unfollow':
          await this.handleUnfollow(event);
          break;
        case 'userEnter':
          await this.handleUserEnter(event);
          break;
        case 'userLeave':
          await this.handleUserLeave(event);
          break;
        case 'fanclubJoin':
          await this.handleFanclubJoin(event);
          break;
        case 'mediaPurchase':
          await this.handleMediaPurchase(event);
          break;
        default:
          logger.debug(`Unhandled event type: ${event.method}`);
      }
    } catch (error) {
      logger.error(`Error handling event ${event.method}`, { error, event });
    }
  }

  private async handleBroadcastStart(_event: ChaturbateEvent) {
    // Auto-start session (legacy)
    const session = await SessionService.start(env.CHATURBATE_USERNAME);
    this.currentSessionId = session.id;
    logger.info(`Session auto-started: ${session.id}`);

    // Also create/find v2 session
    const sessionV2 = await SessionStitcherService.getOrCreateActiveSession();
    logger.info(`Session v2 active: ${sessionV2.id}`);

    // Start room presence tracking for this session
    RoomPresenceService.startSession(session.id);
  }

  private async handleBroadcastStop(_event: ChaturbateEvent) {
    // Auto-end session (legacy)
    if (this.currentSessionId) {
      await SessionService.end(this.currentSessionId);
      logger.info(`Session auto-ended: ${this.currentSessionId}`);
      this.currentSessionId = null;

      // End room presence tracking
      RoomPresenceService.endSession();
    }

    // End v2 session - transitions from 'active' to 'ended'
    const activeSessionV2 = await SessionStitcherService.getActiveSession();
    if (activeSessionV2) {
      await SessionStitcherService.endSession(activeSessionV2.id);
      logger.info(`Session v2 ended: ${activeSessionV2.id} (status: ended, waiting for merge window)`);
    }
  }

  private async handleChatMessage(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const message = event.object.message?.message;

    if (!username || !message) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate messages from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'CHAT_MESSAGE',
      content: message,
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication
  }

  private async handlePrivateMessage(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const message = event.object.message?.message;
    const fromUser = (event.object.message as any)?.fromUser;
    const toUser = (event.object.message as any)?.toUser;

    if (!username || !message) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate messages from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'PRIVATE_MESSAGE',
      content: message,
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        fromUser,
        toUser,
        // Use broadcaster from event payload - indicates whose room PM occurred in
        broadcaster: event.broadcaster || this.username,
      },
    }, 1); // 1 minute window for deduplication
  }

  private async handleTip(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const tokens = event.object.tip?.tokens;
    const message = event.object.tip?.message || '';

    if (!username || tokens === undefined) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate tips from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'TIP_EVENT',
      content: message || `Tipped ${tokens} tokens`,
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        tokens,
        isAnon: event.object.tip?.isAnon,
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication
  }

  private async handleFollow(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate follows from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'FOLLOW',
      content: 'Followed',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication

    // Update profiles.follower = true (this user is now following me)
    try {
      await query(
        `INSERT INTO profiles (person_id, follower, follower_checked_at, follower_since, unfollower_at)
         VALUES ($1, TRUE, NOW(), NOW(), NULL)
         ON CONFLICT (person_id) DO UPDATE SET
           follower = TRUE,
           follower_checked_at = NOW(),
           follower_since = COALESCE(profiles.follower_since, NOW()),
           unfollower_at = NULL`,
        [person.id]
      );

      // Get the event_log id for linking (most recent for this event)
      const eventLogResult = await query(
        `SELECT id FROM event_logs
         WHERE method = 'follow' AND username = $1
         ORDER BY created_at DESC LIMIT 1`,
        [username]
      );
      const eventId = eventLogResult.rows[0]?.id;

      // Record in follow_history
      await FollowHistoryService.record({
        personId: person.id,
        direction: 'follower',
        action: 'follow',
        source: 'events_api',
        eventId,
      });

      logger.info('User marked as follower from Events API', { username });
    } catch (error) {
      logger.error('Failed to update follower status', { username, error });
    }
  }

  private async handleUnfollow(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate unfollows from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'UNFOLLOW',
      content: 'Unfollowed',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication

    // Update profiles.follower = false (this user has unfollowed me)
    try {
      await query(
        `UPDATE profiles SET
           follower = FALSE,
           follower_checked_at = NOW(),
           unfollower_at = NOW()
         WHERE person_id = $1`,
        [person.id]
      );

      // Get the event_log id for linking (most recent for this event)
      const eventLogResult = await query(
        `SELECT id FROM event_logs
         WHERE method = 'unfollow' AND username = $1
         ORDER BY created_at DESC LIMIT 1`,
        [username]
      );
      const eventId = eventLogResult.rows[0]?.id;

      // Record in follow_history
      await FollowHistoryService.record({
        personId: person.id,
        direction: 'follower',
        action: 'unfollow',
        source: 'events_api',
        eventId,
      });

      logger.info('User marked as unfollower from Events API', { username });
    } catch (error) {
      logger.error('Failed to update unfollower status', { username, error });
    }
  }

  private async handleUserEnter(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate enter events from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'USER_ENTER',
      content: 'Entered room',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication

    // Record room visit (this is your room, so track visits)
    // Track whether we're currently broadcasting
    const isBroadcasting = this.currentSessionId !== null;
    try {
      await RoomVisitsService.recordVisit(
        person.id,
        new Date(),
        undefined,
        isBroadcasting,
        this.currentSessionId
      );
    } catch (error) {
      logger.error('Failed to record room visit', { error, username });
    }

    // Update room presence (for live monitor)
    try {
      await RoomPresenceService.userEnter(person.id, username, event.object.user);
    } catch (error) {
      logger.error('Failed to update room presence on enter', { error, username });
    }
  }

  private async handleUserLeave(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate leave events from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'USER_LEAVE',
      content: 'Left room',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication

    // Update room presence (for live monitor)
    try {
      await RoomPresenceService.userLeave(person.id);
    } catch (error) {
      logger.error('Failed to update room presence on leave', { error, username });
    }
  }

  private async handleFanclubJoin(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate fanclub joins from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'FANCLUB_JOIN',
      content: 'Joined fanclub',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication
  }

  private async handleMediaPurchase(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    // Use deduplication to prevent duplicate media purchases from event retries
    await InteractionService.createIfNotDuplicate({
      personId: person.id,
      type: 'MEDIA_PURCHASE',
      content: 'Purchased media',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object,
        broadcaster: this.username,
      },
    }, 1); // 1 minute window for deduplication
  }
}

export const chaturbateEventsClient = new ChaturbateEventsClient();
