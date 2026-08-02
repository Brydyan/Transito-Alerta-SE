<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\EloquentIncidentRepository;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'Admin']);

    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Test Category']);

    $this->reporter = User::factory()->create();
    $this->actor = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->reporter->id,
        'location_id' => $location->id,
        'title' => 'Audit actor test incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->repository = new EloquentIncidentRepository;
});

it('records the modifier as audit actor, not the reporter', function (): void {
    // Requires the `trg_log_incident_status` trigger, PostgreSQL-only.
    // `composer test` runs exclusively against Postgres
    // (backend-tests-postgres-migration, issue #197), so this always
    // executes for real.
    $this->actingAs($this->actor);

    $this->repository->update($this->incident->id, ['status' => Incident::STATUS_IN_PROGRESS]);

    $history = DB::table('status_history')
        ->where('incident_id', $this->incident->id)
        ->latest('created_at')
        ->first();

    expect($history)->not->toBeNull();
    expect($history->user_id)->toBe($this->actor->id)
        ->and($history->user_id)->not->toBe($this->reporter->id);
});

it('completes without exception when no user is authenticated', function (): void {
    // No actingAs() call — Auth::id() returns null.
    // The trigger falls back to COALESCE(NEW.user_id, OLD.user_id).
    // On SQLite the trigger does not exist but the repository update must still succeed.
    $updated = $this->repository->update($this->incident->id, ['priority' => Incident::PRIORITY_HIGH]);

    expect($updated->priority->value)->toBe(Incident::PRIORITY_HIGH);
});
