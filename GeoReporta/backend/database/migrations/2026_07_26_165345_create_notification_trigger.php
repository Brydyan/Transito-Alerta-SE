<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            CREATE OR REPLACE FUNCTION notify_on_status_change()
            RETURNS TRIGGER AS \$\$
            BEGIN
                IF OLD.status IS DISTINCT FROM NEW.status THEN
                    INSERT INTO notifications (user_id, incident_id, type, message, read, created_at)
                    SELECT
                        COALESCE(assignments.user_id, NEW.user_id),
                        NEW.id,
                        'status_change',
                        'El estado de la incidencia #' || NEW.id || ' ha cambiado a ' || NEW.status,
                        false,
                        NOW()
                    FROM assignments
                    WHERE incident_id = NEW.id
                    ON CONFLICT DO NOTHING;
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_notify_on_status_change
            AFTER UPDATE ON incidents
            FOR EACH ROW
            EXECUTE FUNCTION notify_on_status_change();
        ');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP TRIGGER IF EXISTS trg_notify_on_status_change ON incidents');
        DB::statement('DROP FUNCTION IF EXISTS notify_on_status_change()');
    }
};
