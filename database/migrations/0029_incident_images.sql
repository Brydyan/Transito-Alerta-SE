-- T6.6 — Create incident_images table and permissions
BEGIN;

CREATE TABLE IF NOT EXISTS incident_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  url           TEXT NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     BIGINT NOT NULL CHECK (file_size > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_images_incident_id
  ON incident_images (incident_id);

-- Permission catalog rows
INSERT INTO permissions (resource, action)
VALUES
  ('incident-images', 'CREATE'),
  ('incident-images', 'DELETE')
ON CONFLICT DO NOTHING;

-- Grant to operador_organizacion role
UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'operador_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'operador_organizacion';

-- Grant to admin_organizacion role
UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'admin_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'admin_organizacion';

COMMIT;
