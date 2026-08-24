-- T6.3 — Add claimed_at and resolution_date to incidents
BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolution_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN incidents.claimed_at IS 'Timestamp del último claim; no se borra en release (historial)';
COMMENT ON COLUMN incidents.resolution_date IS 'Timestamp cuando el incidente pasó a resolved; NULL si vuelve a in_progress';

CREATE INDEX IF NOT EXISTS idx_incidents_resolution_date
  ON incidents (resolution_date)
  WHERE resolution_date IS NOT NULL;

COMMIT;
