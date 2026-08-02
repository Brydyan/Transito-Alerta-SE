<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'Admin']);

    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $this->org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Test Category']);
    $this->user = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('assigns organization by setting organization_id', function (): void {
    $this->incident->update([
        'organization_id' => $this->org->id,
        'claimed_by' => $this->user->id,
        'claimed_at' => now(),
    ]);

    $this->incident->refresh();
    expect($this->incident->organization_id)->toBe($this->org->id);
    expect($this->incident->claimed_by)->toBe($this->user->id);
    expect($this->incident->claimed_at)->not->toBeNull();
});

it('incident without organization appears in unassigned query', function (): void {
    $location2 = Location::create(['name' => 'Location 2', 'level' => 'city']);
    $category2 = IncidentCategory::create(['name' => 'Category 2']);

    $assignedIncident = Incident::create([
        'incident_category_id' => $category2->id,
        'user_id' => $this->user->id,
        'location_id' => $location2->id,
        'title' => 'Assigned Incident',
        'status' => 'pending',
        'priority' => 'low',
        'organization_id' => $this->org->id,
    ]);

    $unassigned = Incident::whereNull('organization_id')->get();

    expect($unassigned->contains($this->incident))->toBeTrue();
    expect($unassigned->contains($assignedIncident))->toBeFalse();
});
