<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

// ═══════════════════════════════════════════════════════════════════════════════
// CP-05-04-BD: Location Normalization (No Redundancy)
// ═══════════════════════════════════════════════════════════════════════════════

it('validates location table normalization without redundancy', function () {
    // Create location hierarchy
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);
    $city2 = Location::create(['name' => 'Latacunga', 'level' => 'city', 'parent_id' => $province->id]);

    // Verify: each combination of name + level + parent_id is unique (no redundancy)
    $query = DB::table('locations')
        ->select('name', 'level', 'parent_id', DB::raw('COUNT(*) as total_count'))
        ->groupBy('name', 'level', 'parent_id')
        ->havingRaw('COUNT(*) > 1');

    expect($query->get())->toHaveCount(0)
        ->and(Location::count())->toBe(4);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CP-06-04-BD: Category FK Integrity (Leaf-Only Validation)
// ═══════════════════════════════════════════════════════════════════════════════

it('prevents assigning parent category to incident (trigger validation)', function () {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);

    // Create parent category (has children)
    $parentCat = IncidentCategory::create(['name' => 'Infrastructure', 'organization_id' => $org->id]);
    $leafCat = IncidentCategory::create(['name' => 'Roads', 'parent_id' => $parentCat->id, 'organization_id' => $org->id]);

    // Test 1: Assign leaf category (should succeed)
    $incident1 = Incident::create([
        'title' => 'Test Leaf',
        'incident_category_id' => $leafCat->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);
    expect($incident1->id)->toBeInt();

    // Test 2: Assign parent category (should fail with trigger if PostgreSQL)
    if (DB::connection()->getDriverName() === 'pgsql') {
        expect(fn () => Incident::create([
            'title' => 'Test Parent',
            'incident_category_id' => $parentCat->id,
            'user_id' => $user->id,
            'location_id' => $location->id,
            'organization_id' => $org->id,
            'status' => IncidentStatus::Pending,
            'priority' => 'medium',
        ]))->toThrow(Exception::class);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CP-08-06-BD: Average Resolution Time Query
// ═══════════════════════════════════════════════════════════════════════════════

it('calculates average resolution time correctly (CP-08-06-BD)', function () {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    // Create resolved incidents with raw DB insert so created_at is not overwritten
    $createdAt1 = now()->subDays(5);
    $resolutionDate1 = $createdAt1->copy()->addDays(2); // 2 days

    DB::table('incidents')->insert([
        'title' => 'Incident 1',
        'incident_category_id' => $category->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'resolved',
        'priority' => 'medium',
        'resolution_date' => $resolutionDate1,
        'created_at' => $createdAt1,
        'updated_at' => $createdAt1,
    ]);

    $createdAt2 = now()->subDays(3);
    $resolutionDate2 = $createdAt2->copy()->addDays(2); // 2 days

    DB::table('incidents')->insert([
        'title' => 'Incident 2',
        'incident_category_id' => $category->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'resolved',
        'priority' => 'medium',
        'resolution_date' => $resolutionDate2,
        'created_at' => $createdAt2,
        'updated_at' => $createdAt2,
    ]);

    // Query: average resolution time
    $result = DB::table('incidents')
        ->where('status', 'resolved')
        ->whereNotNull('resolution_date')
        ->select(
            DB::raw('COUNT(*) as total_resolved'),
            DB::raw('AVG(EXTRACT(EPOCH FROM (resolution_date - created_at)) / 86400.0)::NUMERIC(5,2) as avg_days')
        )
        ->first();

    expect($result->total_resolved)->toBe(2)
        ->and((float) $result->avg_days)->toBeGreaterThan(1.0)
        ->and((float) $result->avg_days)->toBeLessThan(3.0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CP-02-06-BD: Trigger Auto-Logs Status Changes to History
// ═══════════════════════════════════════════════════════════════════════════════

it('trigger automatically logs status changes to history (CP-02-06-BD)', function () {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $incident = Incident::create([
        'title' => 'Test Trigger',
        'incident_category_id' => $category->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Update status (trigger should auto-insert history)
    $incident->update(['status' => IncidentStatus::InProgress]);

    // Verify: history record exists (if PostgreSQL with trigger)
    if (DB::connection()->getDriverName() === 'pgsql') {
        $history = DB::table('status_history')
            ->where('incident_id', $incident->id)
            ->latest('created_at')
            ->first();

        expect($history)->not->toBeNull()
            ->and($history->previous_status)->toBe('pending')
            ->and($history->new_status)->toBe('in_progress');
    }
});

it('verifies foreign key constraints exist', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('FK constraint check only for PostgreSQL');
    }

    $fkCount = DB::select("
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    ")[0]->count;

    expect($fkCount)->toBeGreaterThanOrEqual(10)
        ->and($fkCount)->toBeLessThanOrEqual(50);
});

it('verifies triggers are installed', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('Trigger check only for PostgreSQL');
    }

    $triggers = DB::select("
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        AND trigger_name LIKE 'trg_%'
    ");

    $triggerNames = array_map(fn ($t) => $t->trigger_name, $triggers);

    expect($triggerNames)->toContain('trg_validate_leaf_category')
        ->toContain('trg_log_incident_status')
        ->toContain('trg_auto_assign_location');
});

// ═══════════════════════════════════════════════════════════════════════════════
// sc-123 / PR-1: admin-approval-notifications — DB foundation
// ═══════════════════════════════════════════════════════════════════════════════

it('allows closed status on incidents (CHECK constraint extended)', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('CHECK constraint only for PostgreSQL');
    }

    DB::table('roles')->insert([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $user = User::factory()->create(['role_id' => 1]);

    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    // Must NOT throw SQLSTATE[23514]
    $incident = Incident::create([
        'title' => 'Closed Incident',
        'incident_category_id' => $category->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Closed,
        'priority' => 'medium',
    ]);

    expect($incident->id)->toBeInt()
        ->and($incident->status)->toBe(IncidentStatus::Closed);
});

it('allows incident_pending_approval notification type (CHECK constraint extended)', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('CHECK constraint only for PostgreSQL');
    }

    DB::table('roles')->insert([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $user = User::factory()->create(['role_id' => 1]);

    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $incident = Incident::create([
        'title' => 'Pending Approval',
        'incident_category_id' => $category->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Must NOT throw SQLSTATE[23514]
    DB::table('notifications')->insert([
        'user_id' => $user->id,
        'incident_id' => $incident->id,
        'type' => 'incident_pending_approval',
        'message' => 'Test notification',
        'read' => false,
        'data' => json_encode(['incident_id' => $incident->id]),
        'created_at' => now(),
    ]);

    expect(DB::table('notifications')->where('type', 'incident_pending_approval')->count())->toBe(1);
});

it('has processed_at column on notifications', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('processed_at column check only for PostgreSQL');
    }

    $hasColumn = collect(
        DB::select("
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'notifications' AND column_name = 'processed_at'
        ")
    )->isNotEmpty();

    expect($hasColumn)->toBeTrue();
});

it('has decision audit columns on incidents', function () {
    if (DB::connection()->getDriverName() !== 'pgsql') {
        $this->markTestSkipped('Decision columns check only for PostgreSQL');
    }

    $columns = ['approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason'];
    foreach ($columns as $col) {
        $hasColumn = collect(
            DB::select("
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'incidents' AND column_name = '{$col}'
            ")
        )->isNotEmpty();

        expect($hasColumn)->toBeTrue();
    }
});
