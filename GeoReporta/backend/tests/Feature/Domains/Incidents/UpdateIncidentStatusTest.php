<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

/**
 * PUT /incidents/{incident}/estado — the "only the responsable changes the
 * status" rule. Enforced via IncidentPolicy::updateStatus so the policy is
 * the single owner of the rule (it used to live inline in the controller).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    // Re-register dynamic gates from the freshly seeded permissions table
    // (same seam as AssignmentControllerTest — AppServiceProvider::boot()
    // ran before this seed).
    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->withoutMiddleware(JwtAuthenticate::class);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $operadorRoleId = (int) DB::table('roles')->where('name', 'operador_organizacion')->value('id');

    $this->responsable = User::factory()->create([
        'role_id' => $operadorRoleId,
        'organization_id' => $org->id,
    ]);
    $this->apoyo = User::factory()->create([
        'role_id' => $operadorRoleId,
        'organization_id' => $org->id,
    ]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->responsable->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => Incident::STATUS_PENDING,
        'priority' => 'medium',
    ]);

    DB::table('assignments')->insert([
        [
            'incident_id' => $this->incident->id,
            'user_id' => $this->responsable->id,
            'assignment_role' => 'responsable',
            'created_at' => now(),
            'updated_at' => now(),
        ],
        [
            'incident_id' => $this->incident->id,
            'user_id' => $this->apoyo->id,
            'assignment_role' => 'apoyo',
            'created_at' => now(),
            'updated_at' => now(),
        ],
    ]);
});

it('allows the responsable to change the status', function (): void {
    $this->actingAs($this->responsable)
        ->putJson("/api/incidents/{$this->incident->id}/estado", [
            'status' => Incident::STATUS_IN_PROGRESS,
        ])
        ->assertOk();

    expect($this->incident->fresh()->status->value)->toBe(Incident::STATUS_IN_PROGRESS);
});

it('denies a status change to an assignee that is not responsable', function (): void {
    $this->actingAs($this->apoyo)
        ->putJson("/api/incidents/{$this->incident->id}/estado", [
            'status' => Incident::STATUS_IN_PROGRESS,
        ])
        ->assertForbidden();

    expect($this->incident->fresh()->status->value)->toBe(Incident::STATUS_PENDING);
});

it('allows a same-status request from a non-responsable (no-op)', function (): void {
    $this->actingAs($this->apoyo)
        ->putJson("/api/incidents/{$this->incident->id}/estado", [
            'status' => Incident::STATUS_PENDING,
        ])
        ->assertOk();
});

it('rejects an invalid status value', function (): void {
    $this->actingAs($this->responsable)
        ->putJson("/api/incidents/{$this->incident->id}/estado", [
            'status' => 'foo',
        ])
        ->assertStatus(422);
});

it('rejects closed status (must use the approval flow, not /estado)', function (): void {
    $this->actingAs($this->responsable)
        ->putJson("/api/incidents/{$this->incident->id}/estado", [
            'status' => 'closed',
        ])
        ->assertStatus(422)
        ->assertJsonFragment([
            'status' => ['El estado closed solo puede asignarse a través del flujo de aprobación.'],
        ]);

    // State must not have changed.
    expect($this->incident->fresh()->status->value)->toBe(Incident::STATUS_PENDING);
});
