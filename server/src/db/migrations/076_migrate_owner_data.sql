-- Migration 076: Create owner account and migrate existing data
-- Links existing data to the owner user (hudson_cage)

-- Create the owner user account
-- Note: This creates a placeholder that will be completed on first Google OAuth login
DO $$
DECLARE
  v_person_id UUID;
  v_owner_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_owner_role_id UUID;
BEGIN
  -- Find the person record for hudson_cage (if exists)
  SELECT id INTO v_person_id
  FROM persons
  WHERE LOWER(username) = 'hudson_cage'
  LIMIT 1;

  -- Get owner role ID
  SELECT id INTO v_owner_role_id
  FROM roles
  WHERE name = 'owner';

  -- Insert owner user with email_password auth method
  -- User can later change to Google OAuth or other method
  INSERT INTO users (
    id,
    auth_method,
    email,
    email_verified,
    display_name,
    linked_person_id,
    created_at
  ) VALUES (
    v_owner_user_id,
    'email_password',
    'owner@mhc.local',
    TRUE,
    'Hudson Cage',
    v_person_id,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create user profile for owner
  INSERT INTO user_profiles (user_id, theme)
  VALUES (v_owner_user_id, 'midnight')
  ON CONFLICT (user_id) DO NOTHING;

  -- Assign owner role
  INSERT INTO user_roles (user_id, role_id, assigned_at)
  VALUES (v_owner_user_id, v_owner_role_id, NOW())
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- Log the migration
  RAISE NOTICE 'Owner account created with ID: %, linked to person: %', v_owner_user_id, v_person_id;
END $$;

-- Comments
COMMENT ON TABLE users IS 'User accounts - owner account (ID: 00000000-0000-0000-0000-000000000001) created by migration 076';
