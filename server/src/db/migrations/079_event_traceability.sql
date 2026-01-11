-- Migration 079: Event Traceability and Direct Message Classification
-- 1. Add cb_event_id to store Chaturbate's native event ID (e.g., "1768167770126-0")
-- 2. Add event_log_id to interactions for traceability back to raw events
-- 3. Add DIRECT_MESSAGE to interactions type check constraint
-- 4. Reclassify empty-broadcaster privateMessage events as directMessage
-- 5. Reclassify empty-broadcaster PRIVATE_MESSAGE interactions as DIRECT_MESSAGE

-- Add Chaturbate's event ID column to event_logs
ALTER TABLE event_logs
  ADD COLUMN IF NOT EXISTS cb_event_id VARCHAR(50);

-- Index for looking up by Chaturbate event ID
CREATE INDEX IF NOT EXISTS idx_event_logs_cb_event_id ON event_logs(cb_event_id)
  WHERE cb_event_id IS NOT NULL;

-- Backfill cb_event_id from raw_event JSONB for existing records
UPDATE event_logs
SET cb_event_id = raw_event->>'id'
WHERE cb_event_id IS NULL
  AND raw_event->>'id' IS NOT NULL;

-- Add event_log_id to interactions for traceability
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS event_log_id UUID REFERENCES event_logs(id) ON DELETE SET NULL;

-- Index for looking up interactions by event_log_id
CREATE INDEX IF NOT EXISTS idx_interactions_event_log_id ON interactions(event_log_id)
  WHERE event_log_id IS NOT NULL;

-- Update check constraint to include DIRECT_MESSAGE type
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_type_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_type_check CHECK (
  type::text = ANY (ARRAY[
    'CHAT_MESSAGE', 'PRIVATE_MESSAGE', 'DIRECT_MESSAGE', 'TIP_EVENT',
    'PROFILE_PASTE', 'CHAT_IMPORT', 'MANUAL_NOTE', 'FOLLOW', 'UNFOLLOW',
    'USER_ENTER', 'USER_LEAVE', 'FANCLUB_JOIN', 'MEDIA_PURCHASE'
  ]::text[])
);

-- Reclassify event_logs: privateMessage with empty broadcaster -> directMessage
-- Check raw_event.broadcaster since the broadcaster column may have been backfilled with owner username
UPDATE event_logs
SET
  method = 'directMessage',
  broadcaster = ''
WHERE method = 'privateMessage'
  AND (raw_event->>'broadcaster' = '' OR raw_event->>'broadcaster' IS NULL);

-- Reclassify interactions: PRIVATE_MESSAGE with empty broadcaster -> DIRECT_MESSAGE
UPDATE interactions
SET type = 'DIRECT_MESSAGE'
WHERE type = 'PRIVATE_MESSAGE'
  AND (metadata->>'broadcaster' = '' OR metadata->>'broadcaster' IS NULL);

-- Add isDM flag to metadata for reclassified interactions
UPDATE interactions
SET metadata = metadata || '{"isDM": true}'::jsonb
WHERE type = 'DIRECT_MESSAGE'
  AND (metadata->>'isDM' IS NULL OR metadata->>'isDM' = 'false');
