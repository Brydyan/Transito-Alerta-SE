-- 0001_initial_schema.sql
-- Transito Alerta SE — initial schema (T1.2)
--
-- MANUAL EXECUTION ONLY. Per CC3 (Manual Migration Integrity) and design
-- D-notes ("TypeORM synchronize:false, migrationsRun:false"), this file is
-- pasted and run manually in the Supabase SQL editor by a human operator.
-- Nothing in the application auto-applies migrations. Record the result in
-- database/MIGRATION_LOG.md after running.
--
-- Rollback: database/rollback/0001_initial_schema.DOWN.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(255) NOT NULL,
  zone_id    uuid, -- FK to geo_zones added in 0002 (geo_zones doesn't exist yet)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Users table (D1 — one row per identity, anonymous device registration and
-- authenticated accounts share this table; permissions are a jsonb array of
-- "ACTION resource" strings, cached in Redis by AuthService per D2).
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid varchar(255) NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_device_uuid ON users (device_uuid);

-- Anonymous identity seed (blocker resolution: anonymous permission ceiling
-- = READ/CREATE incidents, CREATE comments — see auth.config.ts
-- anonymousPermissions). This is NOT a separate identity table (design D1).
INSERT INTO users (device_uuid, permissions, is_active)
VALUES (
  'anonymous',
  '["READ incidents", "CREATE incidents", "CREATE comments"]'::jsonb,
  true
)
ON CONFLICT (device_uuid) DO NOTHING;

COMMIT;
