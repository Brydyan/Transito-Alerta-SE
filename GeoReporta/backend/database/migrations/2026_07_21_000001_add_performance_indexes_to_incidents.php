<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Add spatial and attribute indices to incidents table for query performance.
     *
     * - GiST on geom: speeds ST_Within() spatial queries (read-heavy test bottleneck)
     * - Composite (organization_id, status): speeds filtered list queries
     * - Regular (status, priority, location_id): speeds WHERE clause scans
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            // GiST spatial index for ST_Within queries
            DB::statement('CREATE INDEX idx_incidents_geom_gist ON incidents USING GIST (geom)');

            // Attribute indices for filtering
            DB::statement('CREATE INDEX idx_incidents_organization_status ON incidents (organization_id, status)');
            DB::statement('CREATE INDEX idx_incidents_status ON incidents (status)');
            DB::statement('CREATE INDEX idx_incidents_priority ON incidents (priority)');
            DB::statement('CREATE INDEX idx_incidents_location_id ON incidents (location_id)');
            DB::statement('CREATE INDEX idx_incidents_user_id ON incidents (user_id)');
            DB::statement('CREATE INDEX idx_incidents_incident_category_id ON incidents (incident_category_id)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS idx_incidents_geom_gist');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_organization_status');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_status');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_priority');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_location_id');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_user_id');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_incident_category_id');
        }
    }
};
