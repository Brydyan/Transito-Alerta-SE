<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add ON DELETE constraints to critical FKs
        Schema::table('incidents', function (Blueprint $table) {
            if (DB::connection()->getDriverName() === 'pgsql') {
                DB::statement('
                    ALTER TABLE incidents
                    DROP CONSTRAINT IF EXISTS incidents_incident_category_id_foreign,
                    ADD CONSTRAINT incidents_incident_category_id_foreign
                        FOREIGN KEY (incident_category_id)
                        REFERENCES incident_categories(id)
                        ON DELETE RESTRICT
                ');

                DB::statement('
                    ALTER TABLE incidents
                    DROP CONSTRAINT IF EXISTS incidents_location_id_foreign,
                    ADD CONSTRAINT incidents_location_id_foreign
                        FOREIGN KEY (location_id)
                        REFERENCES locations(id)
                        ON DELETE RESTRICT
                ');

                DB::statement('
                    ALTER TABLE incidents
                    DROP CONSTRAINT IF EXISTS incidents_organization_id_foreign,
                    ADD CONSTRAINT incidents_organization_id_foreign
                        FOREIGN KEY (organization_id)
                        REFERENCES organizations(id)
                        ON DELETE SET NULL
                ');
            }
        });

        // Add CHECK constraints for enums
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE incidents
                ADD CONSTRAINT chk_incident_status
                CHECK (status IN ('pending', 'in_progress', 'resolved'))
            ");

            DB::statement("
                ALTER TABLE incidents
                ADD CONSTRAINT chk_incident_priority
                CHECK (priority IN ('low', 'medium', 'high'))
            ");
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incident_status');
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incident_priority');
        }
    }
};
