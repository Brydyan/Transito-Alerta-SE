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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // ── Setup ─────────────────────────────────────────────────
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'Admin'],
        ['id' => 4, 'name' => 'operador_organizacion'],
    ]);

    // Seed the permissions catalog so policy lookups work.
    $this->seed(PermissionSeeder::class);

    // Grant incidents.update to operador_organizacion (role 4) — needed by
    // IncidentPolicy::claim/release after switching from role-name check to
    // $user->can('incidents.update').
    $permId = Permission::where('resource', 'incidents')
        ->where('action', 'update')->value('permission_id');
    DB::table('role_permission')->insertOrIgnore([
        'role_id' => 4,
        'permission_id' => $permId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    // Re-register dynamic gates: AppServiceProvider ran on an empty DB at
    // boot, so no {resource}.{action} gates exist yet. Seed them now so
    // $user->can('incidents.update') resolves correctly in the policy.
    foreach (Permission::all() as $p) {
        Gate::define(
            "{$p->resource}.{$p->action}",
            fn (User $user) => $user->hasPermission("{$p->resource}.{$p->action}"),
        );
    }

    $this->location = Location::create(['name' => 'Test City', 'level' => 'city']);

    // Create placeholder org for category FK, then real orgs
    $placeholderOrg = Organization::create([
        'name' => 'Placeholder',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);
    $this->category = IncidentCategory::create(['name' => 'General', 'organization_id' => $placeholderOrg->id]);

    $this->org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);
    $this->otherOrg = Organization::create([
        'name' => 'Other Org',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $this->operator = User::factory()->create([
        'role_id' => 4,
        'organization_id' => $this->org->id,
    ]);
    $this->otherOperator = User::factory()->create([
        'role_id' => 4,
        'organization_id' => $this->otherOrg->id,
    ]);

    $reporter = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $reporter->id,
        'location_id' => $this->location->id,
        'title' => 'Unassigned incident',
        'status' => 'pending',
        'priority' => 'medium',
        'organization_id' => $this->org->id,
    ]);

    // Skip JWT middleware — we'll use actingAs() directly
    $this->withoutMiddleware(JwtAuthenticate::class);
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Operador claim exitoso → claimed_by seteado, status = in_progress
// ──────────────────────────────────────────────────────────────

it('allows an operator to claim an incident from their org', function (): void {
    $this->actingAs($this->operator);

    $response = $this->postJson("/api/incidents/{$this->incident->id}/claim");

    $response->assertOk();
    $response->assertJsonPath('data.claimed_by', $this->operator->id);
    $response->assertJsonPath('data.status', 'in_progress');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-02: Operador release → claimed_by null, status = pending_operator
// ──────────────────────────────────────────────────────────────

it('allows an operator to release their claimed incident', function (): void {
    $this->actingAs($this->operator);

    // First claim
    $this->postJson("/api/incidents/{$this->incident->id}/claim")->assertOk();

    // Then release
    $response = $this->postJson("/api/incidents/{$this->incident->id}/release");

    $response->assertOk();
    $response->assertJsonPath('data.claimed_by', null);
    $response->assertJsonPath('data.status', 'pending');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Claim de incidencia de otra org → 403
// ──────────────────────────────────────────────────────────────

it('rejects claim from operator of a different organization', function (): void {
    $this->actingAs($this->otherOperator);

    $response = $this->postJson("/api/incidents/{$this->incident->id}/claim");

    $response->assertStatus(403);
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Claim de incidencia ya asignada → 409
// ──────────────────────────────────────────────────────────────

it('rejects claim when incident is already claimed', function (): void {
    $this->actingAs($this->operator);

    // Claim first time
    $this->postJson("/api/incidents/{$this->incident->id}/claim")->assertOk();

    // Try to claim again
    $response = $this->postJson("/api/incidents/{$this->incident->id}/claim");

    $response->assertStatus(409);
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-03: Límite de claims excedido → 429
// ──────────────────────────────────────────────────────────────

it('rejects claim when operator exceeds max active claims limit', function (): void {
    $this->org->update(['max_active_claims' => 1]);

    $reporter = User::factory()->create();
    $secondIncident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $reporter->id,
        'location_id' => $this->location->id,
        'title' => 'Second incident',
        'status' => 'pending',
        'priority' => 'medium',
        'organization_id' => $this->org->id,
    ]);

    $this->actingAs($this->operator);

    // Claim first incident
    $this->postJson("/api/incidents/{$this->incident->id}/claim")->assertOk();

    // Try to claim second incident (limit is 1, so this should fail)
    $response = $this->postJson("/api/incidents/{$secondIncident->id}/claim");

    $response->assertStatus(429);
});

// ──────────────────────────────────────────────────────────────
// Full flow: claim → release → claim again
// ──────────────────────────────────────────────────────────────

it('supports claim → release → reclaim flow', function (): void {
    $this->actingAs($this->operator);

    // Claim
    $this->postJson("/api/incidents/{$this->incident->id}/claim")->assertOk();

    // Release
    $this->postJson("/api/incidents/{$this->incident->id}/release")->assertOk();

    // Claim again
    $response = $this->postJson("/api/incidents/{$this->incident->id}/claim");
    $response->assertOk();
    $response->assertJsonPath('data.claimed_by', $this->operator->id);
});
