<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Replace the log_incident_status trigger body so it records the
     * authenticated actor (set via set_config) instead of always
     * falling back to the incident reporter's user_id.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            CREATE OR REPLACE FUNCTION log_incident_status()
            RETURNS TRIGGER AS \$\$
            DECLARE
                v_actor_id BIGINT;
            BEGIN
                IF OLD.status IS DISTINCT FROM NEW.status THEN
                    v_actor_id := NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;

                    IF v_actor_id IS NULL THEN
                        v_actor_id := COALESCE(NEW.user_id, OLD.user_id);
                    END IF;

                    INSERT INTO status_history (incident_id, user_id, previous_status, new_status, created_at)
                    VALUES (
                        NEW.id,
                        v_actor_id,
                        OLD.status,
                        NEW.status,
                        NOW()
                    );
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
        ");
    }

    /**
     * Restore the original COALESCE-only body from the initial trigger migration.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('
            CREATE OR REPLACE FUNCTION log_incident_status()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD.status IS DISTINCT FROM NEW.status THEN
                    INSERT INTO status_history (incident_id, user_id, previous_status, new_status, created_at)
                    VALUES (
                        NEW.id,
                        COALESCE(NEW.user_id, OLD.user_id),
                        OLD.status,
                        NEW.status,
                        NOW()
                    );
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ');
    }
};
