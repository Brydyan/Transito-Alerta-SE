-- Rollback T6.6 — Drop incident_images table and permissions
BEGIN;

DROP TABLE IF EXISTS incident_images;

DELETE FROM permissions WHERE resource = 'incident-images';

COMMIT;
