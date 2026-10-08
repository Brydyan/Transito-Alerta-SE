-- 0067_restore_anonymous_mask.DOWN.sql
-- Rollback for 0067 — restores the row to its pre-fix state.
--
-- A repair migration has no meaningful "undo": if the row did not exist
-- before, the only honest DOWN is to remove it again; if it existed but
-- was soft-deleted or desviated, removing it would break AUD (sc-327)
-- FK references and force a two-step masquerade.
--
-- The 0048 comment is explicit: DO NOT delete this row. The mask row is
-- shared publication identity for anonymous reports; AUD recycles it
-- as displayed authorship. Deleting it here would break every anonymous
-- incident/comment FK and require a follow-up migration to recreate the
-- same row with the same id.
--
-- This DOWN is informational and SHOULD NOT be applied without a fresh
-- decision from a maintainer. If a true rollback is ever required, the
-- operator must first confirm no incident_reporters/comments reference
-- the row's id, then decide row deletion vs. desviación repair.

BEGIN;

-- No-op with intent. To deliberately remove the mask row (after checking
-- references), a maintainer would run instead:
--   DELETE FROM users WHERE device_uuid = 'anonymous';
-- Do NOT run that without confirming FK references are gone.

COMMIT;