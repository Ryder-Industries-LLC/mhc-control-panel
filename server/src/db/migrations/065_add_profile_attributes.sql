-- Migration 065: Add profile attribute flags
-- Following the same pattern as watch_list (026) and banned_by_me (052)

-- Add smoke_on_cam boolean field (manual toggle - user confirmed they were smoking on cam)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoke_on_cam BOOLEAN DEFAULT FALSE;

-- Add leather_fetish boolean field (manual toggle - user seen wearing leather/fetish gear)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS leather_fetish BOOLEAN DEFAULT FALSE;

-- Add profile_smoke boolean field (auto-populated from smoke_drink field)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_smoke BOOLEAN DEFAULT FALSE;

-- Add had_interaction boolean field (indicates user has chatted with this person)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS had_interaction BOOLEAN DEFAULT FALSE;

-- Add partial indexes for efficient filtering (only index TRUE values)
CREATE INDEX IF NOT EXISTS idx_profiles_smoke_on_cam ON profiles (smoke_on_cam) WHERE smoke_on_cam = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_leather_fetish ON profiles (leather_fetish) WHERE leather_fetish = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_profile_smoke ON profiles (profile_smoke) WHERE profile_smoke = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_had_interaction ON profiles (had_interaction) WHERE had_interaction = TRUE;

-- Add comments
COMMENT ON COLUMN profiles.smoke_on_cam IS 'User manually confirmed they were smoking on cam';
COMMENT ON COLUMN profiles.leather_fetish IS 'User manually confirmed they were wearing leather/fetish gear on cam';
COMMENT ON COLUMN profiles.profile_smoke IS 'Auto-populated: TRUE if smoke_drink indicates positive smoking (YES, YEAH, SOMETIMES)';
COMMENT ON COLUMN profiles.had_interaction IS 'User has chatted with this model/viewer before';
