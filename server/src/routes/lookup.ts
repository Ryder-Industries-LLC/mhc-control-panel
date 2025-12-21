import { Router, Request, Response } from 'express';
import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { normalizeMemberInfo, normalizeModelInfo } from '../api/statbate/normalizer.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * POST /api/lookup
 * Main lookup endpoint for the home page
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      username,
      role,
      pastedText,
      includeStatbate = false,
      // includeMyRoomData = false,
    } = req.body;

    if (!username && !pastedText) {
      return res.status(400).json({ error: 'username or pastedText required' });
    }

    // Extract usernames from pasted text if provided
    let usernames: string[] = [];
    if (pastedText) {
      // Simple extraction: split by whitespace and filter valid usernames
      const extracted = pastedText.match(/\b[a-zA-Z0-9_]+\b/g) || [];
      usernames = [...new Set(extracted.filter((u: unknown) => typeof u === 'string' && u.length > 2))] as string[];
    }

    if (username) {
      usernames.unshift(username);
    }

    if (usernames.length === 0) {
      return res.status(400).json({ error: 'No valid usernames found' });
    }

    // Save pasted text as interaction if provided
    if (pastedText && username) {
      const person = await PersonService.findOrCreate({
        username: usernames[0],
        role: role || 'UNKNOWN',
      });

      await InteractionService.create({
        personId: person.id,
        type: 'PROFILE_PASTE',
        content: pastedText,
        source: 'manual',
      });
    }

    // Process primary username
    const primaryUsername = usernames[0];
    const person = await PersonService.findOrCreate({
      username: primaryUsername,
      role: role || 'UNKNOWN',
    });

    let latestSnapshot = null;
    let delta = null;
    let statbateApiUrl = null; // Track which API was called

    // Fetch Statbate data if requested
    if (includeStatbate) {
      try {
        // Try as MODEL first, then as VIEWER if MODEL fails
        let statbateDataFetched = false;

        // Determine which role to try based on:
        // 1. Explicit role from request (user preference)
        // 2. Person's existing role from database
        // 3. Default to trying MODEL first
        const effectiveRole = role || person.role;
        const isExplicitOverride = !!role; // Track if user explicitly requested a specific role

        if (effectiveRole === 'MODEL' || effectiveRole === 'UNKNOWN') {
          try {
            statbateApiUrl = `https://plus.statbate.com/api/model/chaturbate/${primaryUsername}/info?timezone=UTC`;
            const modelData = await statbateClient.getModelInfo('chaturbate', primaryUsername);
            if (modelData) {
              const normalized = normalizeModelInfo(modelData.data);
              const snapshot = await SnapshotService.create({
                personId: person.id,
                source: 'statbate_model',
                rawPayload: modelData.data as unknown as Record<string, unknown>,
                normalizedMetrics: normalized,
              });

              // Only update role if not an explicit override (auto-detection mode)
              if (!isExplicitOverride && modelData.data.rid) {
                await PersonService.update(person.id, { rid: modelData.data.rid, role: 'MODEL' });
              } else if (modelData.data.rid) {
                // Just update rid without changing role
                await PersonService.update(person.id, { rid: modelData.data.rid });
              }

              const deltaResult = await SnapshotService.getDelta(person.id, 'statbate_model');
              latestSnapshot = snapshot;
              delta = deltaResult.delta;
              statbateDataFetched = true;
            }
          } catch (modelError) {
            logger.debug('Not a model or model data unavailable', { username: primaryUsername });
          }
        }

        // Try as VIEWER if not already fetched
        if (!statbateDataFetched && (effectiveRole === 'VIEWER' || effectiveRole === 'UNKNOWN')) {
          try {
            statbateApiUrl = `https://plus.statbate.com/api/members/chaturbate/${primaryUsername}/info?timezone=UTC`;
            const memberData = await statbateClient.getMemberInfo('chaturbate', primaryUsername);
            if (memberData) {
              const normalized = normalizeMemberInfo(memberData.data);
              const snapshot = await SnapshotService.create({
                personId: person.id,
                source: 'statbate_member',
                rawPayload: memberData.data as unknown as Record<string, unknown>,
                normalizedMetrics: normalized,
              });

              // Only update role if not an explicit override (auto-detection mode)
              if (!isExplicitOverride && memberData.data.did) {
                await PersonService.update(person.id, { did: memberData.data.did, role: 'VIEWER' });
              } else if (memberData.data.did) {
                // Just update did without changing role
                await PersonService.update(person.id, { did: memberData.data.did });
              }

              const deltaResult = await SnapshotService.getDelta(person.id, 'statbate_member');
              latestSnapshot = snapshot;
              delta = deltaResult.delta;
              statbateDataFetched = true;
            }
          } catch (memberError) {
            logger.debug('Not a member or member data unavailable', { username: primaryUsername });
          }
        }

        if (!statbateDataFetched) {
          logger.warn('No Statbate data found for user', { username: primaryUsername });
        }
      } catch (error) {
        logger.error('Error fetching Statbate data', { error, username: primaryUsername });
      }
    }

    // Get recent interactions
    const interactions = await InteractionService.getByPerson(person.id, { limit: 20 });

    // Get latest interaction
    const latestInteraction = await InteractionService.getLatest(person.id);

    res.json({
      person,
      latestSnapshot,
      delta,
      interactions,
      latestInteraction,
      extractedUsernames: usernames,
      statbateApiUrl, // Include the actual API URL for debugging
    });
  } catch (error) {
    logger.error('Lookup error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
