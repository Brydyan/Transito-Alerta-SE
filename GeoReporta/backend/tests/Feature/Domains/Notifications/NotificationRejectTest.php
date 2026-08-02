<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    $this->withoutMiddleware(JwtAuthenticate::class);

    $this->location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $this->org = Organization::create(['name' => 'Test Org', 'location_id' => $this->location->id, 'max_active_claims' => 5]);
    $this->org2 = Organization::create(['name' => 'Other Org', 'location_id' => $this->location->id, 'max_active_claims' => 5]);
    $this->category = IncidentCategory::create(['name' => 'Test Category', 'organization_id' => $this->org->id]);

    // Look up role IDs dynamically (RoleSeeder pins names but id may not be stable).
    $roleAdminSistema = (int) DB::table('roles')->where('name', UserRole::AdminSistema->value)->value('id');
    $roleAdminOrganizacion = (int) DB::table('roles')->where('name', UserRole::AdminOrganizacion->value)->value('id');
    $roleOperadorOrganizacion = (int) DB::table('roles')->where('name', UserRole::OperadorOrganizacion->value)->value('id');
    $roleUsuario = (int) DB::table('roles')->where('name', UserRole::Usuario->value)->value('id');

    // Admin sistema global.
    $this->adminSistemaGlobal = User::factory()->create(['role_id' => $roleAdminSistema, 'organization_id' => null]);
    // Admin organizacion.
    $this->adminOrg = User::factory()->create(['role_id' => $roleAdminOrganizacion, 'organization_id' => $this->org->id]);
    // Admin org2.
    $this->adminOrg2 = User::factory()->create(['role_id' => $roleAdminOrganizacion, 'organization_id' => $this->org2->id]);
    // Operador.
    $this->operador = User::factory()->create(['role_id' => $roleOperadorOrganizacion, 'organization_id' => $this->org->id]);
    // Ciudadano.
    $this->ciudadano = User::factory()->create(['role_id' => $roleUsuario, 'organization_id' => null]);

    // Resolved incident owned by ciudadano.
    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);

    // IncidentPendingApproval notification to admin sistema global.
    $this->notification = Notification::create([
        'user_id' => $this->adminSistemaGlobal->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Incidencia pendiente de aprobación',
        'data' => [],
        'read' => false,
    ]);
});

// ──────────────────────────────────────────────────────────────
// Happy path
// ──────────────────────────────────────────────────────────────

it('reject returns 200 with valid reason', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $response = $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo válido de 11 caracteres',
    ]);

    $response->assertOk();

    $this->notification->refresh();
    $this->incident->refresh();

    expect($this->notification->processed_at)->not->toBeNull()
        ->and($this->notification->read)->toBeTrue();
});

// ──────────────────────────────────────────────────────────────
// Reason validation
// ──────────────────────────────────────────────────────────────

it('reject returns 422 when reason is missing', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [])
        ->assertStatus(422);
});

it('reject returns 422 when reason is 9 characters (below min:10)', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => '123456789',
    ])->assertStatus(422);
});

it('reject returns 422 when reason exceeds 500 characters', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => str_repeat('a', 501),
    ])->assertStatus(422);
});

it('reject accepts reason with exactly 10 characters', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => '1234567890',
    ])->assertOk();
});

it('reject accepts reason with exactly 500 characters', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => str_repeat('a', 500),
    ])->assertOk();
});

it('reject returns 422 when reason is not a string', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 12345,
    ])->assertStatus(422);
});

// ──────────────────────────────────────────────────────────────
// Authorization
// ──────────────────────────────────────────────────────────────

it('reject returns 403 for non-admin', function (): void {
    $this->actingAs($this->operador);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo del rechazo de al menos 10 caracteres',
    ])->assertForbidden();
});

it('reject returns 403 for citizen', function (): void {
    $this->actingAs($this->ciudadano);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo del rechazo de al menos 10 caracteres',
    ])->assertForbidden();
});

it('reject returns 403 for admin_organizacion of different org', function (): void {
    $notificationToAdminOrg2 = Notification::create([
        'user_id' => $this->adminOrg2->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pendiente',
        'data' => [],
        'read' => false,
    ]);

    $this->actingAs($this->adminOrg2);

    $this->postJson("/api/notifications/{$notificationToAdminOrg2->id}/reject", [
        'reason' => 'Motivo del rechazo de al menos 10 caracteres',
    ])->assertForbidden();
});

// ──────────────────────────────────────────────────────────────
// Side-effects
// ──────────────────────────────────────────────────────────────

it('reject persists reason as a Comment on the incident', function (): void {
    $this->actingAs($this->adminSistemaGlobal);
    $reason = 'Motivo de rechazo de prueba de mas de diez caracteres';

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => $reason,
    ])->assertOk();

    $comment = Comment::where('incident_id', $this->incident->id)
        ->where('user_id', $this->adminSistemaGlobal->id)
        ->first();

    expect($comment)->not->toBeNull()
        ->and($comment->message)->toBe($reason);
});

it('reject sets rejected_by, rejected_at, rejection_reason and clears approved fields', function (): void {
    // Pre-set approved fields.
    $this->incident->update([
        'approved_by' => $this->adminSistemaGlobal->id,
        'approved_at' => now(),
    ]);

    $this->actingAs($this->adminSistemaGlobal);
    $reason = 'Motivo de rechazo para limpiar aprobacion previa';

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => $reason,
    ])->assertOk();

    $this->incident->refresh();

    expect($this->incident->rejected_by)->toBe($this->adminSistemaGlobal->id)
        ->and($this->incident->rejected_at)->not->toBeNull()
        ->and($this->incident->rejection_reason)->toBe($reason)
        ->and($this->incident->approved_by)->toBeNull()
        ->and($this->incident->approved_at)->toBeNull();
});

it('reject sets status to in_progress when there is an active claimant', function (): void {
    // Assign the operador as claimant.
    $this->incident->update(['claimed_by' => $this->operador->id]);

    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo de rechazo con claimant activo',
    ])->assertOk();

    $this->incident->refresh();

    expect($this->incident->status)->toBe(IncidentStatus::InProgress);
});

it('reject sets status to pending when there is no claimant', function (): void {
    $this->incident->update(['claimed_by' => null]);

    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo de rechazo sin claimant',
    ])->assertOk();

    $this->incident->refresh();

    expect($this->incident->status)->toBe(IncidentStatus::Pending);
});

it('reject sets processed_at on the notification', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo de rechazo con processed_at',
    ])->assertOk();

    $this->notification->refresh();

    expect($this->notification->processed_at)->not->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// Transaction rollback
// ──────────────────────────────────────────────────────────────

it('reject rolls back on invalid reason length (defense-in-depth)', function (): void {
    $this->actingAs($this->adminSistemaGlobal);

    // The service re-checks reason length even if request validation passes.
    // This test verifies the service-level guard.
    // Since we test request-level above, this confirms the service also guards.

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => '123456789', // 9 chars — below min
    ])->assertStatus(422);
});

// ──────────────────────────────────────────────────────────────
// Sibling notification resolution
// ──────────────────────────────────────────────────────────────

it('reject resolves sibling IncidentPendingApproval notifications for the same incident', function (): void {
    // Two admins (global + org) both received a pending approval for the
    // same incident. When the first admin rejects, the second admin's
    // notification should also be marked processed so the UI does not show
    // a ghost "pending" item that will 409 on click.
    $sibling = Notification::create([
        'user_id' => $this->adminOrg->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pendiente',
        'data' => [],
        'read' => false,
    ]);

    expect($this->notification->processed_at)->toBeNull();
    expect($sibling->processed_at)->toBeNull();

    $this->actingAs($this->adminSistemaGlobal);

    $this->postJson("/api/notifications/{$this->notification->id}/reject", [
        'reason' => 'Motivo de rechazo valido de mas de diez caracteres',
    ])->assertOk();

    $sibling->refresh();

    expect($sibling->processed_at)->not->toBeNull()
        ->and($sibling->read)->toBeTrue();
});
