-- Migration 062: Media transfer job state
-- Stores configuration and state for the background media transfer job

INSERT INTO job_state (job_name, config)
VALUES (
  'media-transfer',
  '{
    "enabled": false,
    "intervalMinutes": 60,
    "destination": "auto",
    "batchSize": 100
  }'::jsonb
)
ON CONFLICT (job_name) DO NOTHING;

COMMENT ON TABLE job_state IS 'Stores state and configuration for background jobs including media-transfer';
