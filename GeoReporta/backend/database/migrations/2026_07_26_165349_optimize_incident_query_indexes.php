<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Add query optimization indexes for dashboard filters and common queries.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_org_status ON incidents (organization_id, status)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_location_id ON incidents (location_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_category_id ON incidents (incident_category_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents (user_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_incidents_resolution_date ON incidents (resolution_date)');

            DB::statement('CREATE INDEX IF NOT EXISTS idx_locations_parent_id ON locations (parent_id)');

            DB::statement('CREATE INDEX IF NOT EXISTS idx_status_history_incident_id ON status_history (incident_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_status_history_user_id ON status_history (user_id)');

            DB::statement('CREATE INDEX IF NOT EXISTS idx_comments_incident_id ON comments (incident_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id)');

            DB::statement('CREATE INDEX IF NOT EXISTS idx_assignments_incident_id ON assignments (incident_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments (user_id)');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS idx_incidents_status');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_org_status');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_location_id');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_category_id');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_user_id');
            DB::statement('DROP INDEX IF EXISTS idx_incidents_resolution_date');

            DB::statement('DROP INDEX IF EXISTS idx_locations_parent_id');

            DB::statement('DROP INDEX IF EXISTS idx_status_history_incident_id');
            DB::statement('DROP INDEX IF EXISTS idx_status_history_user_id');

            DB::statement('DROP INDEX IF EXISTS idx_comments_incident_id');
            DB::statement('DROP INDEX IF EXISTS idx_comments_user_id');

            DB::statement('DROP INDEX IF EXISTS idx_assignments_incident_id');
            DB::statement('DROP INDEX IF EXISTS idx_assignments_user_id');
        }
    }
};
