-- 0025_aud_anon_module.DOWN.sql
-- Reverts Group G consolidation in reverse section order: 4→3→2→1
--
-- WARNING: sections 1 and 2 are destructive if production data exists.
-- Section 3 restores the anonymous permission ceiling (product decision
-- reversed). Section 4 is a no-op with intent — see comment below.

BEGIN;

-- ── 4) Anonymous mask row — no-op (informational) ────────────────────────
-- A repair migration has no meaningful undo. The 0048 comment is explicit:
-- DO NOT delete this row — it is shared publication identity for anonymous
-- reports and AUD recycles it as displayed authorship. Deleting it would
-- break every anonymous incident/comment FK.
-- If a true rollback is ever required, a maintainer must first confirm no
-- incident_reporters or comments reference the row's id, then run:
--   DELETE FROM users WHERE device_uuid = 'anonymous';
-- Do NOT run that without confirming FK references are gone.

-- ── 3) Restore anonymous permission ceiling ───────────────────────────────
-- Use ONLY if the product decision of 2026-09-02 is reversed.
UPDATE users
   SET permissions = '["READ incidents", "CREATE incidents", "READ comments", "CREATE comments"]'::jsonb,
       updated_at  = now()
 WHERE device_uuid = 'anonymous';

-- ── 2) Drop incident_reporters + is_anonymous ─────────────────────────────
-- DESTRUCTIVE: drops the only source of truth for real anonymous authorship.
-- If AUD already wrote reporter rows in production, authors become
-- irrecoverable (citizen_id points to the mask, not the real person).
DROP TABLE IF EXISTS incident_reporters CASCADE;

ALTER TABLE incidents
  DROP COLUMN IF EXISTS is_anonymous;

-- ── 1) Drop audit_events ──────────────────────────────────────────────────
-- DESTRUCTIVE: indexes drop automatically with the table.
-- If AUD already wrote production events, this destroys the audit log.
DROP TABLE IF EXISTS audit_events CASCADE;

COMMIT;
