<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // ── Setup roles ───────────────────────────────────────────
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
        ['id' => 2, 'name' => 'operador_sistema'],
        ['id' => 3, 'name' => 'admin_organizacion'],
        ['id' => 4, 'name' => 'operador_organizacion'],
        ['id' => 5, 'name' => 'usuario'],
    ]);

    // Fetch role IDs by name for dynamic reference
    $this->adminSistemaRoleId = Role::where('name', 'admin_sistema')->first()->id;
    $this->adminOrgRoleId = Role::where('name', 'admin_organizacion')->first()->id;
    $this->operadorOrgRoleId = Role::where('name', 'operador_organizacion')->first()->id;
    $this->usuarioRoleId = Role::where('name', 'usuario')->first()->id;

    // ── Locations ─────────────────────────────────────────────
    $location1 = Location::create(['name' => 'City A', 'level' => 'city']);
    $location2 = Location::create(['name' => 'City B', 'level' => 'city']);

    // ── Categories — need org first for FK ─────────────────────
    $placeholderOrg = Organization::create([
        'name' => 'Placeholder',
        'location_id' => $location1->id,
        'max_active_claims' => 5,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $placeholderOrg->id,
    ]);

    // ── Organizations (2 orgs × 3 incidents each = 6 total) ───
    $this->orgA = Organization::create([
        'name' => 'Org A',
        'location_id' => $location1->id,
        'max_active_claims' => 5,
    ]);
    $this->orgB = Organization::create([
        'name' => 'Org B',
        'location_id' => $location2->id,
        'max_active_claims' => 5,
    ]);

    $reporter = User::factory()->create();

    // 3 incidents for Org A
    foreach (range(1, 3) as $i) {
        Incident::create([
            'incident_category_id' => $category->id,
            'user_id' => $reporter->id,
            'location_id' => $location1->id,
            'title' => "Org A incident #{$i}",
            'status' => 'pending',
            'priority' => 'medium',
            'organization_id' => $this->orgA->id,
        ]);
    }

    // 3 incidents for Org B
    foreach (range(1, 3) as $i) {
        Incident::create([
            'incident_category_id' => $category->id,
            'user_id' => $reporter->id,
            'location_id' => $location2->id,
            'title' => "Org B incident #{$i}",
            'status' => 'pending',
            'priority' => 'medium',
            'organization_id' => $this->orgB->id,
        ]);
    }

    // Remove JWT middleware so actingAs() works directly.
    // Also remove Authorize middleware since the controller uses
    // authorizeResource() which checks $user->can('incidents.view'),
    // and we don't have permissions set up in tests.
    $this->withoutMiddleware([
        JwtAuthenticate::class,
        Authorize::class,
    ]);
});

// ──────────────────────────────────────────────────────────────
// REQ-RBAC-03: SuperAdmin ve todas (6)
// ──────────────────────────────────────────────────────────────

it('SuperAdmin sees all incidents across all organizations', function (): void {
    $superAdmin = User::factory()->create(['role_id' => $this->adminSistemaRoleId]);
    $this->actingAs($superAdmin);

    $response = $this->getJson('/api/incidents');

    $response->assertOk();
    $response->assertJsonPath('meta.total', 6);
});

// ──────────────────────────────────────────────────────────────
// REQ-RBAC-03: AdminOrganización ve solo las de su org (3)
// ──────────────────────────────────────────────────────────────

it('AdminOrganización sees only incidents from their own organization', function (): void {
    $adminOrg = User::factory()->create([
        'role_id' => $this->adminOrgRoleId,
        'organization_id' => $this->orgA->id,
    ]);
    $this->actingAs($adminOrg);

    $response = $this->getJson('/api/incidents');

    $response->assertOk();
    $response->assertJsonPath('meta.total', 3);
    collect($response->json('data'))->each(
        fn (array $incident) => expect($incident['organization_id'])->toBe($this->orgA->id)
    );
});

// ──────────────────────────────────────────────────────────────
// REQ-RBAC-03: OperadorOrg ve solo las de su org (3)
// ──────────────────────────────────────────────────────────────

it('OperadorOrg sees only incidents from their own organization', function (): void {
    $operator = User::factory()->create([
        'role_id' => $this->operadorOrgRoleId,
        'organization_id' => $this->orgB->id,
    ]);

    // OperadorOrg scoping (EloquentIncidentRepository::applyFilters) ties
    // operator visibility to the `assignments` pivot on top of the org
    // filter — operators only see incidents they're formally assigned to,
    // not every org incident. Assign the operator to all 3 Org B incidents
    // so the assertion (total=3) still verifies org-scoping end-to-end.
    DB::table('assignments')->insert(
        Incident::where('organization_id', $this->orgB->id)
            ->get(['id'])
            ->map(fn ($incident) => [
                'incident_id' => $incident->id,
                'user_id' => $operator->id,
                'assignment_role' => 'responsable',
                'created_at' => now(),
                'updated_at' => now(),
            ])
            ->all()
    );

    $this->actingAs($operator);

    $response = $this->getJson('/api/incidents');

    $response->assertOk();
    $response->assertJsonPath('meta.total', 3);
    collect($response->json('data'))->each(
        fn (array $incident) => expect($incident['organization_id'])->toBe($this->orgB->id)
    );
});

// ──────────────────────────────────────────────────────────────
// REQ-RBAC-03: Usuario NO ve incidencias en index() → 0
// ──────────────────────────────────────────────────────────────

it('Usuario sees zero incidents in index', function (): void {
    $usuario = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
    ]);
    $this->actingAs($usuario);

    $response = $this->getJson('/api/incidents');

    $response->assertOk();
    $response->assertJsonPath('meta.total', 0);
});
