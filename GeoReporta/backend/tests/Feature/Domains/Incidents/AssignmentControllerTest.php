<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Feature tests for the `assignments` sub-resource behind
 *   GET    /api/incidents/{incident}/assignments
 *   POST   /api/incidents/{incident}/assignments
 *   DELETE /api/incidents/{incident}/assignments/{assignment}
 *
 * Phase 1 (happy paths below) predates policy/permission gating and
 * relies on the default factory user (role_id 1, admin_sistema, which
 * bypasses every gate via `Gate::before` in `AppServiceProvider`) —
 * it does not seed permission grants at all.
 *
 * PR #2 wires `AssignmentPolicy` + `PermissionSeeder`/
 * `RolePermissionSeeder` (`assignments.view|create|delete`). The 403
 * coverage block below seeds those tables explicitly and mirrors the
 * pattern in `tests/Feature/CommentControllerTest.php` — dynamic
 * gates from the `permissions` table are registered too late for a
 * per-test seed to be picked up by `AppServiceProvider::boot()`, so
 * each 403 test that needs a real (non-admin) actor re-registers them
 * locally.
 *
 * The Service-level guarantees are covered by
 * tests/Unit/Domains/Incidents/AssignmentServiceTest.php; this file
 * exists to lock the HTTP contract (status codes, JSON shape,
 * pagination behaviour) that the front-end tab in PR #3 will consume.
 */
uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Direct DB::insert, not Role::query()->updateOrCreate(): Role's
    // $fillable = ['name'] excludes `id`, so the Eloquent mass-assignment
    // path silently drops the explicit id and lets auto-increment assign
    // whatever the sequence happens to be at (see RoleSeederTest / the
    // same convention documented in AssignmentPolicyTest.php).
    DB::table('roles')->insertOrIgnore(['id' => 1, 'name' => UserRole::AdminSistema->value]);

    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $category = IncidentCategory::create(['name' => 'Cat']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $reporter = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->alice = User::factory()->create();
    $this->bob = User::factory()->create();

    $this->withoutMiddleware(JwtAuthenticate::class);
});

// ---------------------------------------------------------------------------
// POST /incidents/{incident}/assignments
// ---------------------------------------------------------------------------

it('creates a responsable assignment and returns 201', function (): void {
    $response = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->alice->id,
            'role' => AssignmentRole::Responsable->value,
        ]);

    $response->assertStatus(201);
    $response->assertJsonPath('data.role', AssignmentRole::Responsable->value);
    $response->assertJsonPath('data.user_id', $this->alice->id);
    $response->assertJsonPath('data.incident_id', $this->incident->id);

    $this->assertDatabaseHas('assignments', [
        'incident_id' => $this->incident->id,
        'user_id' => $this->alice->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);
});

it('creates an apoyo assignment and returns 201', function (): void {
    $response = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->bob->id,
            'role' => AssignmentRole::Apoyo->value,
        ]);

    $response->assertStatus(201);
    $response->assertJsonPath('data.role', AssignmentRole::Apoyo->value);
});

it('rejects an unknown role string with 422', function (): void {
    $response = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->bob->id,
            'role' => 'supervisor',
        ]);

    $response->assertStatus(422);
});

it('rejects a second responsable on the same incident with 422', function (): void {
    $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->alice->id,
            'role' => AssignmentRole::Responsable->value,
        ])->assertStatus(201);

    $response = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->bob->id,
            'role' => AssignmentRole::Responsable->value,
        ]);

    $response->assertStatus(422);

    // Only the original row persists.
    $count = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->where('assignment_role', AssignmentRole::Responsable->value)
        ->count();
    expect($count)->toBe(1);
});

it('allows multiple apoyo assignments on the same incident (201 each)', function (): void {
    $c1 = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->alice->id,
            'role' => AssignmentRole::Apoyo->value,
        ])->assertStatus(201);

    $c2 = $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->bob->id,
            'role' => AssignmentRole::Apoyo->value,
        ])->assertStatus(201);

    expect(DB::table('assignments')->where('incident_id', $this->incident->id)->count())->toBe(2);
});

// ---------------------------------------------------------------------------
// DELETE /incidents/{incident}/assignments/{assignment}
// ---------------------------------------------------------------------------

it('deletes an existing assignment and returns 204', function (): void {
    $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->alice->id,
            'role' => AssignmentRole::Responsable->value,
        ])->assertStatus(201);

    $assignmentId = (int) DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->value('id');

    $response = $this->actingAs($this->alice)
        ->deleteJson("/api/incidents/{$this->incident->id}/assignments/{$assignmentId}");

    $response->assertStatus(204);
    // unassign() soft-deletes (#202) — the row still physically exists
    // with deleted_at set, it does not disappear from the table.
    $this->assertSoftDeleted('assignments', ['id' => $assignmentId]);
});

it('returns 404 when deleting a non-existent assignment', function (): void {
    $response = $this->actingAs($this->alice)
        ->deleteJson("/api/incidents/{$this->incident->id}/assignments/999999");

    $response->assertStatus(404);
});

// ---------------------------------------------------------------------------
// GET /incidents/{incident}/assignments
// ---------------------------------------------------------------------------

it('lists assignments for an incident with user eagerly loaded', function (): void {
    $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->alice->id,
            'role' => AssignmentRole::Responsable->value,
        ])->assertStatus(201);

    $this->actingAs($this->alice)
        ->postJson("/api/incidents/{$this->incident->id}/assignments", [
            'user_id' => $this->bob->id,
            'role' => AssignmentRole::Apoyo->value,
        ])->assertStatus(201);

    $response = $this->actingAs($this->alice)
        ->getJson("/api/incidents/{$this->incident->id}/assignments");

    $response->assertOk();
    $response->assertJsonCount(2, 'data');

    // Both rows must surface the user payload — the front-end renders the
    // operator's name next to each row, so missing the eager load would
    // show "Operador #3" with a follow-up fetch to /users/{id}.
    $response->assertJsonStructure([
        'data' => [
            ['id', 'incident_id', 'user_id', 'role', 'user' => ['id']],
        ],
    ]);
});

// ---------------------------------------------------------------------------
// Authorization (403) — AssignmentPolicy + RolePermissionSeeder (PR #2)
// ---------------------------------------------------------------------------

describe('authorization (403)', function (): void {
    beforeEach(function (): void {
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
        $this->seed(RolePermissionSeeder::class);

        // Register dynamic gates from the permissions table (same seam as
        // tests/Feature/CommentControllerTest.php:32-35). Without this the
        // gates registered by AppServiceProvider::boot() would already be
        // stale (they ran before this beforeEach seeded the table).
        foreach (Permission::all() as $permission) {
            $slug = "{$permission->resource}.{$permission->action}";
            Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
        }
    });

    it('denies assignment creation for operador_organizacion without assignments.create', function (): void {
        $operator = User::factory()->create(['role_id' => 4]); // operador_organizacion

        $response = $this->actingAs($operator)
            ->postJson("/api/incidents/{$this->incident->id}/assignments", [
                'user_id' => $this->alice->id,
                'role' => AssignmentRole::Responsable->value,
            ]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('assignments', ['incident_id' => $this->incident->id]);
    });

    it('denies assignment creation for usuario without assignments.create', function (): void {
        $stranger = User::factory()->create(['role_id' => 5]); // usuario

        $response = $this->actingAs($stranger)
            ->postJson("/api/incidents/{$this->incident->id}/assignments", [
                'user_id' => $this->alice->id,
                'role' => AssignmentRole::Responsable->value,
            ]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('assignments', ['incident_id' => $this->incident->id]);
    });

    it('denies assignment deletion for operador_organizacion without assignments.delete', function (): void {
        $assignmentId = (int) DB::table('assignments')->insertGetId([
            'incident_id' => $this->incident->id,
            'user_id' => $this->alice->id,
            'assignment_role' => AssignmentRole::Responsable->value,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $operator = User::factory()->create(['role_id' => 4]); // operador_organizacion

        $response = $this->actingAs($operator)
            ->deleteJson("/api/incidents/{$this->incident->id}/assignments/{$assignmentId}");

        $response->assertForbidden();
        $this->assertDatabaseHas('assignments', ['id' => $assignmentId]);
    });

    it('denies assignment deletion for usuario without assignments.delete', function (): void {
        $assignmentId = (int) DB::table('assignments')->insertGetId([
            'incident_id' => $this->incident->id,
            'user_id' => $this->alice->id,
            'assignment_role' => AssignmentRole::Responsable->value,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $stranger = User::factory()->create(['role_id' => 5]); // usuario

        $response = $this->actingAs($stranger)
            ->deleteJson("/api/incidents/{$this->incident->id}/assignments/{$assignmentId}");

        $response->assertForbidden();
        $this->assertDatabaseHas('assignments', ['id' => $assignmentId]);
    });

    it('allows operador_sistema with assignments.view to list but not to create or delete', function (): void {
        $assignmentId = (int) DB::table('assignments')->insertGetId([
            'incident_id' => $this->incident->id,
            'user_id' => $this->alice->id,
            'assignment_role' => AssignmentRole::Responsable->value,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // operador_sistema (role 2) holds `incidents.view` (viewAny gate)
        // and `assignments.view`, but not `assignments.create|delete`.
        $viewer = User::factory()->create(['role_id' => 2]);

        $this->actingAs($viewer)
            ->getJson("/api/incidents/{$this->incident->id}/assignments")
            ->assertOk();

        $this->actingAs($viewer)
            ->postJson("/api/incidents/{$this->incident->id}/assignments", [
                'user_id' => $this->bob->id,
                'role' => AssignmentRole::Apoyo->value,
            ])
            ->assertForbidden();

        $this->actingAs($viewer)
            ->deleteJson("/api/incidents/{$this->incident->id}/assignments/{$assignmentId}")
            ->assertForbidden();
    });
});
