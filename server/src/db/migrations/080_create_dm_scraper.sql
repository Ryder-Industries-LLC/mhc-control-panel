-- Migration 080: DM Scraper Tables and Infrastructure
-- Creates table for storing raw DM data scraped from Chaturbate messages page
-- Tracks scrape state per user and links to processed interactions

-- Raw DM data table - one row per message
CREATE TABLE IF NOT EXISTS chaturbate_dm_raw_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Thread identification
    thread_username VARCHAR(255) NOT NULL,  -- The other user in the conversation

    -- Message content
    message_text TEXT NOT NULL,
    is_from_me BOOLEAN NOT NULL,  -- true = I sent it, false = they sent it

    -- Timestamp parsing
    raw_date_text VARCHAR(100),  -- Original text like "Thu 7:30pm" or "January 4, 2026"
    computed_timestamp TIMESTAMPTZ,  -- Parsed/computed timestamp

    -- Tip detection
    is_tip BOOLEAN DEFAULT FALSE,
    tip_amount INTEGER,  -- Positive = tip to me, negative = tip I gave
    tip_note TEXT,  -- Any message with the tip

    -- Traceability
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,  -- Link to person if matched
    interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,  -- Link if imported
    imported_at TIMESTAMPTZ,  -- When it was imported to interactions

    -- Scrape metadata
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scrape_session_id VARCHAR(50),  -- Groups messages from same scrape run

    -- Prevent duplicates
    message_hash VARCHAR(64),  -- Hash of username + message + timestamp for dedup

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dm_raw_thread_username ON chaturbate_dm_raw_data(thread_username);
CREATE INDEX IF NOT EXISTS idx_dm_raw_person_id ON chaturbate_dm_raw_data(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_raw_imported ON chaturbate_dm_raw_data(imported_at) WHERE imported_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dm_raw_is_tip ON chaturbate_dm_raw_data(is_tip) WHERE is_tip = TRUE;
CREATE INDEX IF NOT EXISTS idx_dm_raw_scraped_at ON chaturbate_dm_raw_data(scraped_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_raw_message_hash ON chaturbate_dm_raw_data(message_hash) WHERE message_hash IS NOT NULL;

-- DM scrape state table - tracks which users have been scraped
CREATE TABLE IF NOT EXISTS dm_scrape_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_username VARCHAR(255) NOT NULL UNIQUE,
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,

    -- Scrape status
    is_scraped BOOLEAN DEFAULT FALSE,
    last_scraped_at TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,

    -- For incremental updates
    newest_message_hash VARCHAR(64),  -- Hash of most recent message to detect new ones

    -- Priority/ordering
    priority INTEGER DEFAULT 0,  -- Higher = scrape first

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_scrape_state_is_scraped ON dm_scrape_state(is_scraped);
CREATE INDEX IF NOT EXISTS idx_dm_scrape_state_priority ON dm_scrape_state(priority DESC, last_scraped_at ASC NULLS FIRST);

-- Add dm_import to interactions source check constraint
-- First drop the existing constraint if it exists
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_source_check;

-- Re-add with dm_import included
ALTER TABLE interactions ADD CONSTRAINT interactions_source_check CHECK (
    source::text = ANY (ARRAY['cb_events', 'statbate_plus', 'manual', 'dm_import']::text[])
);

-- Add tip_dm_id to track tips found in DMs
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS tip_dm_id UUID REFERENCES chaturbate_dm_raw_data(id) ON DELETE SET NULL;
