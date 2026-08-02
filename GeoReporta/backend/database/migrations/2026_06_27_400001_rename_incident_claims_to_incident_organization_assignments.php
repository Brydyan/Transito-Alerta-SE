<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('incident_claims', 'incident_organization_assignments');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incident_organization_assignments RENAME CONSTRAINT incident_claims_status_check TO incident_org_assignments_status_check');
            DB::statement('ALTER INDEX uniq_incident_active_claim RENAME TO uniq_incident_active_org_assignment');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER INDEX uniq_incident_active_org_assignment RENAME TO uniq_incident_active_claim');
            DB::statement('ALTER TABLE incident_organization_assignments RENAME CONSTRAINT incident_org_assignments_status_check TO incident_claims_status_check');
        }

        Schema::rename('incident_organization_assignments', 'incident_claims');
    }
};
