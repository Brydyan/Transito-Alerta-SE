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

beforeEach(function (): void {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
    ]);

    $this->user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $org->id,
    ]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);
});

it('sets resolution_date when status changes to resolved', function (): void {
    expect($this->incident->resolution_date)->toBeNull();

    $this->incident->update([
        'status' => IncidentStatus::Resolved,
    ]);

    expect($this->incident->resolution_date)->not->toBeNull();
    expect($this->incident->resolution_date->isToday())->toBeTrue();
});

it('does not change resolution_date when status changes to something other than resolved', function (): void {
    expect($this->incident->resolution_date)->toBeNull();

    $this->incident->update([
        'status' => IncidentStatus::InProgress,
    ]);

    expect($this->incident->resolution_date)->toBeNull();
});

it('keeps resolution_date unchanged if status was already resolved', function (): void {
    $this->incident->update([
        'status' => IncidentStatus::Resolved,
    ]);

    $firstResolutionDate = $this->incident->resolution_date;
    expect($firstResolutionDate)->not->toBeNull();

    $this->incident->update([
        'title' => 'Updated Title',
    ]);

    expect($this->incident->resolution_date->toIso8601String())->toBe($firstResolutionDate->toIso8601String());
});
