<?php

declare(strict_types=1);

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
    $this->adminOrganizacionRoleId = Role::where('name', 'admin_organizacion')->first()->id;
    $this->usuarioRoleId = Role::where('name', 'usuario')->first()->id;
    $this->adminSistemaRoleId = Role::where('name', 'admin_sistema')->first()->id;
    $this->operadorSistemaRoleId = Role::where('name', 'operador_sistema')->first()->id;

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    // Setup locations
    $this->location = Location::create([
        'name' => 'Main City',
        'level' => 'city',
    ]);

    // Setup organizations
    $this->orgA = Organization::create([
        'name' => 'Organization A',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $this->orgB = Organization::create([
        'name' => 'Organization B',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    // AdminOrganizacion user
    $this->adminA = User::factory()->create([
        'role_id' => $this->adminOrganizacionRoleId,
        'organization_id' => $this->orgA->id,
    ]);
});

it('prevents AdminOrganizacion from creating users in another organization', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->postJson('/api/users', [
            'email' => 'otherorg@example.com',
            'password' => 'password123',
            'role_id' => $this->usuarioRoleId,
            'organization_id' => $this->orgB->id,
            'first_name' => 'Other',
            'last_name' => 'Org User',
            'phone' => '123456789',
        ]);

    // Should return 403 Forbidden because authorize() returns false
    $response->assertStatus(403);
});

it('prevents AdminOrganizacion from assigning administrative roles on user creation', function (int $adminRoleId): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->postJson('/api/users', [
            'email' => 'adminassign@example.com',
            'password' => 'password123',
            'role_id' => $adminRoleId, // admin_sistema (1) or operador_sistema (2)
            'organization_id' => $this->orgA->id,
            'first_name' => 'Admin',
            'last_name' => 'User',
            'phone' => '123456789',
        ]);

    $response->assertStatus(403);
})->with([1, 2]);

it('allows AdminOrganizacion to create users in their own organization with allowed roles', function (): void {
    // Per commit 8f450fd6 (invitation flow), password is `prohibited` on
    // user creation — the admin-invite flow generates a setup-token email
    // instead. The system creates the user, returns 201, and the InvitationService
    // creates UserInvitation row in DB::afterCommit() (S-7 tolerant if the mail
    // wire fails, which is fine in test env).
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->postJson('/api/users', [
            'email' => 'ownorg@example.com',
            'role_id' => $this->usuarioRoleId,
            'organization_id' => $this->orgA->id,
            'first_name' => 'Own',
            'last_name' => 'Org User',
            'phone' => '0991234567',
        ]);

    $response->assertStatus(201);
    $this->assertDatabaseHas('users', [
        'email' => 'ownorg@example.com',
        'organization_id' => $this->orgA->id,
        'role_id' => $this->usuarioRoleId,
    ]);
});

it('prevents AdminOrganizacion from updating a user in another organization', function (): void {
    $otherUser = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => $this->orgB->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->putJson("/api/users/{$otherUser->id}", [
            'first_name' => 'Updated Name',
        ]);

    $response->assertStatus(403);
});

it('prevents AdminOrganizacion from assigning administrative roles on user update', function (int $adminRoleId): void {
    $ownUser = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => $this->orgA->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->putJson("/api/users/{$ownUser->id}", [
            'role_id' => $adminRoleId, // admin_sistema (1) or operador_sistema (2)
        ]);

    $response->assertStatus(403);
})->with([1, 2]);

it('allows AdminOrganizacion to update a user in their own organization', function (): void {
    $ownUser = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => $this->orgA->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->putJson("/api/users/{$ownUser->id}", [
            'first_name' => 'UpdatedFirst',
            'last_name' => 'UpdatedLast',
        ]);

    $response->assertStatus(200);
    $this->assertDatabaseHas('users', [
        'id' => $ownUser->id,
        'first_name' => 'UpdatedFirst',
        'last_name' => 'UpdatedLast',
    ]);
});

it('allows SystemAdmin to create any user in any organization with any role', function (): void {
    $systemAdmin = User::factory()->create([
        'role_id' => $this->adminSistemaRoleId,
        'organization_id' => null,
    ]);

    // Same invitation-flow contract as the AdminOrganizacion test above —
    // password is `prohibited` so the system emails a setup token instead.
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($systemAdmin)
        ->postJson('/api/users', [
            'email' => 'syscreated@example.com',
            'role_id' => $this->operadorSistemaRoleId,
            'organization_id' => $this->orgB->id,
            'first_name' => 'Sys',
            'last_name' => 'Created',
            'phone' => '0991234567',
        ]);

    $response->assertStatus(201);
    $this->assertDatabaseHas('users', [
        'email' => 'syscreated@example.com',
        'role_id' => $this->operadorSistemaRoleId,
        'organization_id' => $this->orgB->id,
    ]);
});

it('allows SystemAdmin to update any user in any organization to any role', function (): void {
    $systemAdmin = User::factory()->create([
        'role_id' => $this->adminSistemaRoleId,
        'organization_id' => null,
    ]);

    $user = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => $this->orgA->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($systemAdmin)
        ->putJson("/api/users/{$user->id}", [
            'role_id' => $this->adminSistemaRoleId,
            'organization_id' => $this->orgB->id,
        ]);

    $response->assertStatus(200);
    $this->assertDatabaseHas('users', [
        'id' => $user->id,
        'role_id' => $this->adminSistemaRoleId,
        'organization_id' => $this->orgB->id,
    ]);
});

it('prevents normal users from creating users', function (): void {
    $normalUser = User::factory()->create([
        'role_id' => $this->usuarioRoleId,
        'organization_id' => null,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($normalUser)
        ->postJson('/api/users', [
            'email' => 'failedcreate@example.com',
            'password' => 'password123',
            'role_id' => $this->usuarioRoleId,
            'first_name' => 'Fail',
            'last_name' => 'User',
        ]);

    $response->assertStatus(403);
});
