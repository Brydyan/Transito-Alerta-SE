<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // 1. Leaf category validation trigger
        DB::statement("
            CREATE OR REPLACE FUNCTION check_is_leaf_category()
            RETURNS TRIGGER AS $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM incident_categories
                    WHERE parent_id = NEW.incident_category_id
                ) THEN
                    RAISE EXCEPTION 'Cannot associate an incident with a parent category (must be a leaf category). ID: %', NEW.incident_category_id;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_validate_leaf_category
            BEFORE INSERT OR UPDATE ON incidents
            FOR EACH ROW
            EXECUTE FUNCTION check_is_leaf_category();
        ');

        // 2. Automatic status history trigger
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

        DB::statement('
            CREATE TRIGGER trg_log_incident_status
            AFTER UPDATE ON incidents
            FOR EACH ROW
            EXECUTE FUNCTION log_incident_status();
        ');

        // 3. Auto geolocation trigger
        DB::statement("
            CREATE OR REPLACE FUNCTION auto_assign_location()
            RETURNS TRIGGER AS $$
            DECLARE
                v_location_id BIGINT;
            BEGIN
                SELECT id INTO v_location_id
                FROM locations
                WHERE ST_Contains(geom, NEW.geom)
                ORDER BY CASE
                    WHEN level = 'neighborhood' THEN 1
                    WHEN level = 'city' THEN 2
                    WHEN level = 'province' THEN 3
                    ELSE 4
                END
                LIMIT 1;

                IF v_location_id IS NOT NULL THEN
                    NEW.location_id := v_location_id;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_auto_assign_location
            BEFORE INSERT OR UPDATE OF geom ON incidents
            FOR EACH ROW
            EXECUTE FUNCTION auto_assign_location();
        ');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP TRIGGER IF EXISTS trg_validate_leaf_category ON incidents');
        DB::statement('DROP TRIGGER IF EXISTS trg_log_incident_status ON incidents');
        DB::statement('DROP TRIGGER IF EXISTS trg_auto_assign_location ON incidents');
        DB::statement('DROP FUNCTION IF EXISTS check_is_leaf_category()');
        DB::statement('DROP FUNCTION IF EXISTS log_incident_status()');
        DB::statement('DROP FUNCTION IF EXISTS auto_assign_location()');
    }
};
