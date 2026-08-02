<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    // Setup locations
    $location = Location::create(['name' => 'Main City', 'level' => 'city']);

    // Setup organizations
    $this->orgA = Organization::create([
        'name' => 'Organization A',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);

    $this->orgB = Organization::create([
        'name' => 'Organization B',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);

    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $this->orgA->id,
    ]);

    // Create incidents
    $this->incidentA = Incident::create([
        'title' => 'Incident in Org A',
        'incident_category_id' => $category->id,
        'user_id' => User::factory()->create()->id,
        'location_id' => $location->id,
        'organization_id' => $this->orgA->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);

    $this->incidentB = Incident::create([
        'title' => 'Incident in Org B',
        'incident_category_id' => $category->id,
        'user_id' => User::factory()->create()->id,
        'location_id' => $location->id,
        'organization_id' => $this->orgB->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('enforces organization-scoped isolation for AdminOrganizacion on view, update and delete', function (): void {
    $adminA = User::factory()->create([
        'role_id' => 3, // admin_organizacion
        'organization_id' => $this->orgA->id,
    ]);

    // Allowed to view, update, delete incidents in own organization
    expect(Gate::forUser($adminA)->allows('view', $this->incidentA))->toBeTrue();
    expect(Gate::forUser($adminA)->allows('update', $this->incidentA))->toBeTrue();
    expect(Gate::forUser($adminA)->allows('delete', $this->incidentA))->toBeTrue();

    // Denied to view, update, delete incidents in other organizations
    expect(Gate::forUser($adminA)->allows('view', $this->incidentB))->toBeFalse();
    expect(Gate::forUser($adminA)->allows('update', $this->incidentB))->toBeFalse();
    expect(Gate::forUser($adminA)->allows('delete', $this->incidentB))->toBeFalse();
});

it('enforces organization-scoped isolation for OperadorOrganizacion on view, update and delete', function (): void {
    $operatorA = User::factory()->create([
        'role_id' => 4, // operador_organizacion
        'organization_id' => $this->orgA->id,
    ]);

    // Allowed to view incidents in own organization
    expect(Gate::forUser($operatorA)->allows('view', $this->incidentA))->toBeTrue();

    // Denied to view incidents in other organizations
    expect(Gate::forUser($operatorA)->allows('view', $this->incidentB))->toBeFalse();
    expect(Gate::forUser($operatorA)->allows('update', $this->incidentB))->toBeFalse();
    expect(Gate::forUser($operatorA)->allows('delete', $this->incidentB))->toBeFalse();
});
