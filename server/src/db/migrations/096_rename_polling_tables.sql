-- Migration 096: Rename snapshot tables to reflect their actual purpose as API polling tables
-- snapshots → statbate_api_polling (stores Statbate API polling data)
-- affiliate_api_snapshots → affiliate_api_polling (stores CB Affiliate API polling data)

-- Rename tables
ALTER TABLE snapshots RENAME TO statbate_api_polling;
ALTER TABLE affiliate_api_snapshots RENAME TO affiliate_api_polling;

-- Rename snapshots indexes
ALTER INDEX idx_snapshots_captured_at RENAME TO idx_statbate_api_polling_captured_at;
ALTER INDEX idx_snapshots_person_id RENAME TO idx_statbate_api_polling_person_id;
ALTER INDEX idx_snapshots_person_source_time RENAME TO idx_statbate_api_polling_person_source_time;
ALTER INDEX idx_snapshots_source RENAME TO idx_statbate_api_polling_source;
ALTER INDEX snapshots_pkey RENAME TO statbate_api_polling_pkey;
ALTER INDEX snapshots_unique RENAME TO statbate_api_polling_unique;

-- Rename affiliate_api_snapshots indexes
ALTER INDEX idx_affiliate_api_snapshots_observed_at RENAME TO idx_affiliate_api_polling_observed_at;
ALTER INDEX idx_affiliate_api_snapshots_person_id RENAME TO idx_affiliate_api_polling_person_id;
ALTER INDEX idx_affiliate_snapshots_profile_image_id RENAME TO idx_affiliate_polling_media_locator_id;
ALTER INDEX broadcast_sessions_pkey RENAME TO affiliate_api_polling_pkey;
ALTER INDEX unique_observation RENAME TO affiliate_api_polling_unique_observation;

-- Rename constraints
ALTER TABLE statbate_api_polling RENAME CONSTRAINT snapshots_source_check TO statbate_api_polling_source_check;
ALTER TABLE statbate_api_polling RENAME CONSTRAINT snapshots_person_id_fkey TO statbate_api_polling_person_id_fkey;
ALTER TABLE affiliate_api_polling RENAME CONSTRAINT broadcast_sessions_person_id_fkey TO affiliate_api_polling_person_id_fkey;
ALTER TABLE affiliate_api_polling RENAME CONSTRAINT affiliate_api_snapshots_media_locator_id_fkey TO affiliate_api_polling_media_locator_id_fkey;
