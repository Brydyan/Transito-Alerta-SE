-- database/rollback/0014_status_history.DOWN.sql
-- T3.4: drops the audit trail table and its permission row. Destructive: the
-- rows cannot be reconstructed — incidents.status keeps only the current value.

BEGIN;

DELETE FROM permissions WHERE resource = 'status-history';

-- Drops the table with its constraints and idx_status_history_incident_created.
DROP TABLE IF EXISTS status_history;

COMMIT;
