import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PersonService } from '../../services/person.service.js';
import { InteractionService } from '../../services/interaction.service.js';
import { SessionService } from '../../services/session.service.js';
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
   * Log event to database
   */
  private async logEvent(event: ChaturbateEvent) {
    try {
      // broadcaster is a string field, not an object
      const broadcaster = (event.object.broadcaster as unknown as string) || this.username;
      const username = event.object.user?.username || broadcaster;

      logger.info('Logging event to database', {
        method: event.method,
        broadcaster,
        username,
      });

      await query(
        `INSERT INTO event_logs (method, broadcaster, username, raw_event)
         VALUES ($1, $2, $3, $4)`,
        [event.method, broadcaster, username, JSON.stringify(event.object)]
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
    // Auto-start session
    const session = await SessionService.start(env.CHATURBATE_USERNAME);
    this.currentSessionId = session.id;
    logger.info(`Session auto-started: ${session.id}`);
  }

  private async handleBroadcastStop(_event: ChaturbateEvent) {
    // Auto-end session
    if (this.currentSessionId) {
      await SessionService.end(this.currentSessionId);
      logger.info(`Session auto-ended: ${this.currentSessionId}`);
      this.currentSessionId = null;
    }
  }

  private async handleChatMessage(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const message = event.object.message?.message;

    if (!username || !message) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'CHAT_MESSAGE',
      content: message,
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handlePrivateMessage(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const message = event.object.message?.message;
    const fromUser = (event.object.message as any)?.fromUser;
    const toUser = (event.object.message as any)?.toUser;

    if (!username || !message) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'PRIVATE_MESSAGE',
      content: message,
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        fromUser,
        toUser,
        broadcaster: this.username,
      },
    });
  }

  private async handleTip(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    const tokens = event.object.tip?.tokens;
    const message = event.object.tip?.message || '';

    if (!username || tokens === undefined) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
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
    });
  }

  private async handleFollow(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'FOLLOW',
      content: 'Followed',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handleUnfollow(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'UNFOLLOW',
      content: 'Unfollowed',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handleUserEnter(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'USER_ENTER',
      content: 'Entered room',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handleUserLeave(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'USER_LEAVE',
      content: 'Left room',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handleFanclubJoin(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'FANCLUB_JOIN',
      content: 'Joined fanclub',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object.user,
        broadcaster: this.username,
      },
    });
  }

  private async handleMediaPurchase(event: ChaturbateEvent) {
    const username = event.object.user?.username;
    if (!username) return;

    const person = await PersonService.findOrCreate({ username, role: 'VIEWER' });

    await InteractionService.create({
      personId: person.id,
      type: 'MEDIA_PURCHASE',
      content: 'Purchased media',
      source: 'cb_events',
      streamSessionId: this.currentSessionId,
      metadata: {
        ...event.object,
        broadcaster: this.username,
      },
    });
  }
}

export const chaturbateEventsClient = new ChaturbateEventsClient();
