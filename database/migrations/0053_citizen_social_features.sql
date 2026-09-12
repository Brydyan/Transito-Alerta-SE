-- Migration 0053: Citizen Social Features (incident_followers, incident_corroborations)
-- Dependencies: none (independent)
-- Renumbered from 0049: 0049 was already taken by 0049_admin_user_permissions (F6,
-- applied to supabase 2026-09-09). Original F4 file was 0049_citizen_social_features.sql.

-- 1. Create incident_followers table
CREATE TABLE incident_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, user_id)
);
CREATE INDEX idx_incident_followers_user_id ON incident_followers(user_id);

-- 2. Create incident_corroborations table
CREATE TABLE incident_corroborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, user_id)
);
CREATE INDEX idx_incident_corroborations_incident_id ON incident_corroborations(incident_id);

-- 3. Register permissions in catalog
INSERT INTO permissions (resource, action) VALUES
('incident-followers', 'CREATE'),
('incident-followers', 'DELETE'),
('incident-corroborations', 'CREATE');

-- 4. Update role permissions (roles.permissions jsonb)
-- Roles: master, operador_sistema, admin_org, operador_org
-- We need to add the new permissions to their JSONB column.
-- Pattern: UPDATE roles SET permissions = permissions || '["CREATE incident-followers", ...]'::jsonb WHERE name = ...;
-- NOTE: The project uses "CREATE incident-followers" as string or "incident-followers:CREATE"?
-- The prompt says "CREATE incident-followers", "DELETE incident-followers", "CREATE incident-corroborations".
-- Let's look at 0019/0039 for the pattern.

DO $$
DECLARE
    role_record RECORD;
    new_perms JSONB := '["CREATE incident-followers", "DELETE incident-followers", "CREATE incident-corroborations"]'::jsonb;
BEGIN
    FOR role_record IN SELECT id, permissions FROM roles WHERE name IN ('master', 'operador_sistema', 'admin_org', 'operador_org') LOOP
        UPDATE roles
        SET permissions = permissions || new_perms
        WHERE id = role_record.id;
    END LOOP;
END $$;

-- 5. Propagate to users.permissions (D5)
-- We need to update all users who have these roles and their permission_version is NOT the latest.
-- The prompt mentions bumpeando permission_version.
-- Migration 0043 bumped permission_version.
-- I should bump the permission version to invalidate Redis.
-- "bumpea permission_version para invalidar perm:v3:uid:*"

UPDATE users
SET permissions = (
    SELECT permissions FROM roles WHERE roles.id = users.role_id
),
    permission_version = permission_version + 1
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('master', 'operador_sistema', 'admin_org', 'operador_org'));
