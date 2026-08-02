<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
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

    // Fetch role IDs by name
    $this->usuarioRoleId = Role::where('name', 'usuario')->first()->id;
    $this->operadorOrganizacionRoleId = Role::where('name', 'operador_organizacion')->first()->id;

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->location = Location::create(['name' => 'Main City', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Org A',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $this->category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $this->org->id,
    ]);

    // Usuario (regular user)
    $this->regularUser = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => null,
    ]);

    // OperadorOrganizacion
    $this->operator = User::factory()->create([
        'role_id' => $this->operadorOrganizacionRoleId,
        'organization_id' => $this->org->id,
    ]);

    // Incident in Org A
    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $this->category->id,
        'user_id' => $this->regularUser->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'status' => 'pending',
        'priority' => 'medium',
        'description' => 'Original description',
    ]);
});

it('prevents regular user from setting organization_id when creating an incident', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->regularUser)
        ->postJson('/api/incidents', [
            'title' => 'New Incident',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => 'medium',
            'organization_id' => $this->org->id, // Regular user cannot set organization_id
        ]);

    $response->assertStatus(403);
});

it('allows regular user to create an incident without setting organization_id', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->regularUser)
        ->postJson('/api/incidents', [
            'title' => 'New Incident',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => 'medium',
        ]);

    $response->assertStatus(201);
});

it('prevents OperadorOrganizacion from updating locked incident fields', function (string $field, mixed $newValue): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            $field => $newValue,
        ]);

    $response->assertStatus(403);
})->with([
    ['title', 'New Title'],
    ['priority', 'high'],
    ['incident_category_id', 999],
    ['location_id', 999],
]);

it('allows OperadorOrganizacion to update description of an incident', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'description' => 'Updated by operator',
        ]);

    $response->assertStatus(200);
    $this->assertDatabaseHas('incidents', [
        'id' => $this->incident->id,
        'description' => 'Updated by operator',
    ]);
});

it('prevents OperadorOrganizacion from updating an incident from another organization', function (): void {
    $otherOrg = Organization::create([
        'name' => 'Org B',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $otherIncident = Incident::create([
        'title' => 'Other Incident',
        'incident_category_id' => $this->category->id,
        'user_id' => $this->regularUser->id,
        'location_id' => $this->location->id,
        'organization_id' => $otherOrg->id,
        'status' => 'pending',
        'priority' => 'medium',
        'description' => 'Original description',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$otherIncident->id}", [
            'description' => 'Try to update description of other organization',
        ]);

    $response->assertStatus(403);
});

it('allows SystemAdmin to update any incident field', function (): void {
    $systemAdmin = User::factory()->create([
        'role_id' => 1, // admin_sistema
        'organization_id' => null,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($systemAdmin)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'title' => 'Title Updated by System Admin',
            'priority' => 'high',
        ]);

    $response->assertStatus(200);
    $this->assertDatabaseHas('incidents', [
        'id' => $this->incident->id,
        'title' => 'Title Updated by System Admin',
        'priority' => 'high',
    ]);
});

it('prevents regular user from updating any incident field', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->regularUser)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'description' => 'Try to update description',
        ]);

    $response->assertStatus(403);
});
