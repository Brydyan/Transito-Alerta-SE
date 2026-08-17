-- 0014_status_history.sql
-- Transito Alerta SE — append-only incident status audit trail (T3.4)
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Rollback: database/rollback/0014_status_history.DOWN.sql

BEGIN;

-- 1. Table (columns + PK only; every named constraint is added guarded below,
--    because CREATE TABLE IF NOT EXISTS silently skips inline constraints on a
--    database where the table already exists).
CREATE TABLE IF NOT EXISTS status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid        NOT NULL,
  changed_by_user_id uuid            NULL,
  previous_status    varchar(20) NOT NULL,
  new_status         varchar(20) NOT NULL,
  event_id           varchar(64) NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- No updated_at: the table is append-only and a mutation column would imply otherwise.

-- 2. Constraints (PG has no ADD CONSTRAINT IF NOT EXISTS — pattern from 0013)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_status_history_incident') THEN
    ALTER TABLE status_history ADD CONSTRAINT fk_status_history_incident
      FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE;
  END IF;
END $$;

-- SET NULL, deliberately not CASCADE: deleting a user must never delete the
-- audit of what that user did. Nullable is the price of that FK action.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_status_history_user') THEN
    ALTER TABLE status_history ADD CONSTRAINT fk_status_history_user
      FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- The idempotency key (proposal D4). This constraint IS the ON CONFLICT target.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_status_history_event_id') THEN
    ALTER TABLE status_history ADD CONSTRAINT uq_status_history_event_id UNIQUE (event_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_previous_status') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_previous_status
      CHECK (previous_status IN ('pending', 'in_progress', 'resolved'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_new_status') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_new_status
      CHECK (new_status IN ('pending', 'in_progress', 'resolved'));
  END IF;
END $$;

-- Only real transitions are recorded (L2). Turns a future no-op-update bug into
-- a loud constraint violation instead of a noise row.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_status_history_transition') THEN
    ALTER TABLE status_history ADD CONSTRAINT chk_status_history_transition
      CHECK (previous_status <> new_status);
  END IF;
END $$;

-- 3. Indexes -----------------------------------------------------------------
-- Serves the one read route verbatim: WHERE incident_id = $1 ORDER BY created_at, id.
CREATE INDEX IF NOT EXISTS idx_status_history_incident_created
  ON status_history (incident_id, created_at, id);
-- changed_by_user_id has no index: nothing queries by actor, and the ON DELETE
-- SET NULL scan is a rare admin operation.
-- event_id needs none: uq_status_history_event_id already creates a unique index.

-- 4. Permission catalog ------------------------------------------------------
-- Hyphenated 'status-history' — the exact string
-- formatPermissionString('READ', 'status-history') produces, and the exact
-- string the controller's explicit override passes (D6). READ only: under
-- proposal D7 there is no write route, so CREATE/UPDATE/DELETE rows would be
-- grantable permissions mapping to nothing — a lie in the catalog.
INSERT INTO permissions (resource, action) VALUES
  ('status-history', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
