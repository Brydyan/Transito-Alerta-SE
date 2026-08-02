<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
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

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Org A',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $this->category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $this->org->id,
    ]);

    $this->operator = User::factory()->create([
        'role_id' => 4, // operador_organizacion
        'organization_id' => $this->org->id,
    ]);

    $this->regularUser = User::factory()->create([
        'role_id' => 5, // usuario
        'organization_id' => null,
    ]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $this->category->id,
        'user_id' => $this->regularUser->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
        'description' => 'Original description',
    ]);
});

it('allows operator to change status if they are assigned as responsable', function (): void {
    $this->incident->assignedUsers()->attach($this->operator->id, ['assignment_role' => 'responsable']);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'status' => 'in_progress',
        ]);

    $response->assertStatus(200);
});

it('prevents operator from changing status if they are not assigned', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'status' => 'in_progress',
        ]);

    $response->assertStatus(403);
});

it('prevents operator from changing status if they are assigned only as apoyo', function (): void {
    $this->incident->assignedUsers()->attach($this->operator->id, ['assignment_role' => 'apoyo']);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'status' => 'in_progress',
        ]);

    $response->assertStatus(403);
});

it('allows operator to update other allowed fields without being assigned as responsable', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operator)
        ->putJson("/api/incidents/{$this->incident->id}", [
            'description' => 'New Description',
        ]);

    $response->assertStatus(200);
});
