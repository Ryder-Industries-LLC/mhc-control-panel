import { Router, Request, Response } from 'express';
import { AttributeService } from '../services/attribute.service.js';
import { PersonService } from '../services/person.service.js';
import { logger } from '../config/logger.js';

const router = Router();

// ==================== Attribute Definitions (Admin) ====================

/**
 * GET /api/attributes/definitions
 * Get all attribute definitions
 */
router.get('/definitions', async (_req: Request, res: Response) => {
  try {
    const definitions = await AttributeService.getDefinitions();
    res.json({ definitions });
  } catch (error) {
    logger.error('Error getting attribute definitions', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attributes/definitions/:key
 * Get a single attribute definition
 */
router.get('/definitions/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const definition = await AttributeService.getDefinition(key);
    if (!definition) {
      return res.status(404).json({ error: 'Attribute definition not found' });
    }
    res.json({ definition });
  } catch (error) {
    logger.error('Error getting attribute definition', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/attributes/definitions
 * Create a new attribute definition (custom attributes only)
 */
router.post('/definitions', async (req: Request, res: Response) => {
  try {
    const { key, label, description, color, icon, showAsBadge, sortOrder } = req.body;

    if (!key || !label) {
      return res.status(400).json({ error: 'key and label are required' });
    }

    // Validate key format (alphanumeric and underscores only)
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      return res.status(400).json({
        error: 'Key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores',
      });
    }

    const definition = await AttributeService.createDefinition({
      key,
      label,
      description,
      color,
      icon,
      showAsBadge,
      sortOrder,
    });

    if (!definition) {
      return res.status(400).json({ error: 'Failed to create attribute definition (key may already exist)' });
    }

    res.status(201).json({ definition });
  } catch (error) {
    logger.error('Error creating attribute definition', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/attributes/definitions/:key
 * Update an attribute definition
 */
router.patch('/definitions/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { label, description, color, icon, showAsBadge, sortOrder } = req.body;

    const definition = await AttributeService.updateDefinition(key, {
      label,
      description,
      color,
      icon,
      showAsBadge,
      sortOrder,
    });

    if (!definition) {
      return res.status(404).json({ error: 'Attribute definition not found' });
    }

    res.json({ definition });
  } catch (error) {
    logger.error('Error updating attribute definition', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/attributes/definitions/:key
 * Delete a custom attribute definition (system attributes cannot be deleted)
 */
router.delete('/definitions/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const deleted = await AttributeService.deleteDefinition(key);

    if (!deleted) {
      return res.status(400).json({
        error: 'Cannot delete attribute (may be a system attribute or does not exist)',
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting attribute definition', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Person Attributes ====================

/**
 * GET /api/attributes/person/:username
 * Get all attributes for a person
 */
router.get('/person/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Look up person by username
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const attributes = await AttributeService.getAttributes(person.id);
    const badgeAttributes = await AttributeService.getBadgeAttributes(person.id);
    const checkboxAttributes = await AttributeService.getCheckboxAttributes(person.id);

    res.json({
      attributes,
      badgeAttributes,
      checkboxAttributes,
    });
  } catch (error) {
    logger.error('Error getting profile attributes', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/attributes/person/:username
 * Update attributes for a person
 * Body: { key: boolean, ... }
 */
router.patch('/person/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const attrs = req.body;

    if (!attrs || typeof attrs !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of { key: boolean }' });
    }

    // Look up person by username
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Validate all keys exist in definitions
    const definitions = await AttributeService.getDefinitions();
    const validKeys = new Set(definitions.map(d => d.key));
    const autoKeys = new Set(definitions.filter(d => d.isAutoDerived).map(d => d.key));

    for (const key of Object.keys(attrs)) {
      if (!validKeys.has(key)) {
        return res.status(400).json({ error: `Unknown attribute key: ${key}` });
      }
      if (autoKeys.has(key)) {
        return res.status(400).json({ error: `Cannot manually set auto-derived attribute: ${key}` });
      }
    }

    await AttributeService.setAttributes(person.id, attrs);

    // Return updated attributes
    const attributes = await AttributeService.getAttributes(person.id);
    res.json({ attributes });
  } catch (error) {
    logger.error('Error updating profile attributes', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attributes/person/:username/history
 * Get attribute change history for a person
 */
router.get('/person/:username/history', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { key, limit } = req.query;

    // Look up person by username
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const history = await AttributeService.getHistory(person.id, {
      key: key as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ history });
  } catch (error) {
    logger.error('Error getting attribute history', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
