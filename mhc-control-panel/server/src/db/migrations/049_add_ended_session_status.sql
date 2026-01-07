-- Migration: Add 'ended' status for sessions
-- When a broadcastStop is received, the session transitions from 'active' to 'ended'
-- It remains in 'ended' status until the merge gap expires, then moves to 'pending_finalize'
-- This provides a clearer UX showing the session has ended but may still be extended

-- Drop and recreate the constraint to add 'ended' status
ALTER TABLE broadcast_sessions_v2 DROP CONSTRAINT IF EXISTS broadcast_sessions_v2_status_check;
ALTER TABLE broadcast_sessions_v2 ADD CONSTRAINT broadcast_sessions_v2_status_check
  CHECK (status IN ('active', 'ended', 'pending_finalize', 'finalized'));

-- Update any existing sessions that have ended_at but are still pending_finalize
-- If their finalize_at is in the future, they should be 'ended' instead
UPDATE broadcast_sessions_v2
SET status = 'ended'
WHERE status = 'pending_finalize'
  AND finalize_at > NOW();

-- Create index for efficient querying of ended sessions
CREATE INDEX IF NOT EXISTS idx_sessions_v2_ended ON broadcast_sessions_v2(status) WHERE status = 'ended';
