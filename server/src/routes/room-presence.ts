import { Router, Request, Response } from 'express';
import { RoomPresenceService, roomPresenceEmitter, RoomEvent } from '../services/room-presence.service.js';
import { PersonService } from '../services/person.service.js';
import { logger } from '../config/logger.js';

const router = Router();

// Keep track of connected SSE clients
const sseClients: Set<Response> = new Set();

// Track last known state for detecting changes
let lastKnownCount = 0;
let lastKnownOccupantIds: Set<string> = new Set();

/**
 * Poll database for changes and emit to SSE clients
 * This bridges the gap between worker (writing) and web (reading)
 */
async function pollForChanges() {
  try {
    const occupants = await RoomPresenceService.getCurrentOccupants();
    const currentCount = occupants.length;
    const currentIds = new Set(occupants.map(o => o.person_id));

    // Detect changes
    if (currentCount !== lastKnownCount || !setsEqual(currentIds, lastKnownOccupantIds)) {
      // Find who entered and left
      const entered = occupants.filter(o => !lastKnownOccupantIds.has(o.person_id));
      const leftIds = [...lastKnownOccupantIds].filter(id => !currentIds.has(id));

      // Emit enter events
      for (const user of entered) {
        roomPresenceEmitter.emit('room_event', {
          type: 'user_enter',
          timestamp: new Date(),
          user,
          occupantCount: currentCount,
        } as RoomEvent);
      }

      // Emit leave events (we don't have full user data, so just emit a sync)
      if (leftIds.length > 0 || entered.length > 0) {
        // Send a full sync to ensure clients have accurate state
        roomPresenceEmitter.emit('room_event', {
          type: 'presence_sync',
          timestamp: new Date(),
          occupants,
          occupantCount: currentCount,
        } as RoomEvent);
      }

      lastKnownCount = currentCount;
      lastKnownOccupantIds = currentIds;
    }
  } catch (error) {
    logger.error('Error polling for presence changes', { error });
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Poll every 2 seconds when there are connected clients
let pollInterval: NodeJS.Timeout | null = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(pollForChanges, 2000);
  logger.info('Started room presence polling');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    logger.info('Stopped room presence polling');
  }
}

/**
 * GET /api/room/presence/stream
 * Server-Sent Events endpoint for real-time room presence updates
 */
router.get('/stream', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add this client to our set
  sseClients.add(res);
  logger.info('SSE client connected', { totalClients: sseClients.size });

  // Start polling if this is the first client
  if (sseClients.size === 1) {
    startPolling();
  }

  // Send initial presence state
  (async () => {
    try {
      const occupants = await RoomPresenceService.getCurrentOccupants();
      const sessionInfo = await RoomPresenceService.getSessionInfo();
      const initEvent: RoomEvent = {
        type: 'presence_sync',
        timestamp: new Date(),
        occupants,
        occupantCount: occupants.length,
      };
      res.write(`data: ${JSON.stringify({ ...initEvent, sessionInfo })}\n\n`);

      // Update last known state
      lastKnownCount = occupants.length;
      lastKnownOccupantIds = new Set(occupants.map(o => o.person_id));
    } catch (error) {
      logger.error('Error sending initial presence', { error });
    }
  })();

  // Handle room events (from polling)
  const eventHandler = (event: RoomEvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      logger.error('Error writing SSE event', { error });
    }
  };

  roomPresenceEmitter.on('room_event', eventHandler);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      // Connection probably closed
    }
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    sseClients.delete(res);
    roomPresenceEmitter.off('room_event', eventHandler);
    clearInterval(heartbeatInterval);
    logger.info('SSE client disconnected', { totalClients: sseClients.size });

    // Stop polling if no more clients
    if (sseClients.size === 0) {
      stopPolling();
    }
  });
});

/**
 * GET /api/room/presence
 * Get current room occupants (one-time fetch)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const occupants = await RoomPresenceService.getCurrentOccupants();
    const sessionInfo = await RoomPresenceService.getSessionInfo();
    res.json({
      occupants,
      count: occupants.length,
      streamVisitorCount: RoomPresenceService.getStreamVisitorCount(),
      sessionInfo,
    });
  } catch (error) {
    logger.error('Error getting room presence', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/room/presence/count
 * Get quick count of current occupants
 */
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await RoomPresenceService.getOccupantCount();
    res.json({
      count,
      streamVisitorCount: RoomPresenceService.getStreamVisitorCount(),
    });
  } catch (error) {
    logger.error('Error getting presence count', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/room/presence/sync
 * Force a presence sync to all connected clients
 */
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const event = await RoomPresenceService.syncPresence();
    res.json({
      success: true,
      occupantCount: event.occupantCount,
      clientCount: sseClients.size,
    });
  } catch (error) {
    logger.error('Error syncing presence', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/room/presence/clients
 * Get count of connected SSE clients
 */
router.get('/clients', (_req: Request, res: Response) => {
  res.json({
    connectedClients: sseClients.size,
  });
});

/**
 * GET /api/room/presence/session
 * Get current session info
 */
router.get('/session', async (_req: Request, res: Response) => {
  try {
    const sessionInfo = await RoomPresenceService.getSessionInfo();
    res.json(sessionInfo);
  } catch (error) {
    logger.error('Error getting session info', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/room/presence/seed
 * Manually seed room presence with usernames
 * Useful for adding users who joined before the events client started
 */
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const { usernames } = req.body;

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames array is required' });
    }

    const results: { username: string; success: boolean; error?: string }[] = [];

    for (const username of usernames) {
      try {
        // Find or create the person
        const person = await PersonService.findOrCreate({ username });

        // Add to room presence
        await RoomPresenceService.userEnter(person.id, person.username, {});

        results.push({ username, success: true });
        logger.info('Seeded user into room presence', { username, personId: person.id });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.push({ username, success: false, error: errorMessage });
        logger.error('Failed to seed user', { username, error: err });
      }
    }

    // Trigger a sync to update all clients
    await RoomPresenceService.syncPresence();

    res.json({
      success: true,
      seeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    logger.error('Error seeding room presence', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
