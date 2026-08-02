<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
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

    // Register dynamic gates from permissions table (same seam as
    // RolePermissionSyncTest.php:21-24). Without these, Gate::authorize()
    // would throw on the first test because no gate 'comments.create' etc.
    // would be defined; with them, the gate delegates to hasPermission().
    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->withoutMiddleware(JwtAuthenticate::class);

    // RolePermissionSeeder intentionally omits role 1 (admin_sistema is the
    // Gate::before bypass in production). In tests, where some assertions
    // rely on the bypass not kicking in, we still need the pivot rows for
    // the EXISTING 7 create/list/show/update/delete tests to pass once
    // authorizeResource is wired. This explicit grant is test-only — it
    // mirrors what the production bypass already grants.
    foreach (
        Permission::whereIn('resource', ['comments', 'incidents'])
            ->whereIn('action', ['view', 'create', 'update', 'delete'])
            ->get() as $perm
    ) {
        DB::table('role_permission')->insertOrIgnore([
            'role_id' => 1,
            'permission_id' => $perm->permission_id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    $this->user = User::factory()->create();

    $category = IncidentCategory::create(['name' => 'Test Category']);
    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
});

it('creates a comment and returns 201', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => '¡Se necesita atención urgente!',
        ]);

    $response->assertStatus(201);
    $response->assertJsonStructure([
        'data' => ['id', 'incident_id', 'user_id', 'message'],
    ]);
    $response->assertJsonPath('data.incident_id', $this->incident->id);
});

it('validates required message', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", []);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['message']);
});

it('validates message max length', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => str_repeat('a', 5001),
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['message']);
});

it('lists comments for an incident', function (): void {
    Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'First comment',
    ]);
    Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Second comment',
    ]);
    Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Third comment',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/incidents/{$this->incident->id}/comments");

    $response->assertOk();
    $response->assertJsonCount(3, 'data');
});

it('lists top level comments and nests replies without duplicating at root level', function (): void {
    $parent = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Parent comment',
    ]);

    $child = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Child reply',
        'parent_id' => $parent->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/incidents/{$this->incident->id}/comments");

    $response->assertOk();
    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('data.0.id', $parent->id);
    $response->assertJsonPath('data.0.replies.0.id', $child->id);
});

it('shows a single comment', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Test message',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/comments/{$comment->id}");

    $response->assertOk();
    $response->assertJsonPath('data.message', 'Test message');
});

it('updates a comment', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Original message',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->putJson("/api/comments/{$comment->id}", [
            'message' => 'Updated message',
        ]);

    $response->assertOk();
    $response->assertJsonPath('data.message', 'Updated message');
});

it('deletes a comment (soft)', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'To be deleted',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->deleteJson("/api/comments/{$comment->id}");

    $response->assertStatus(204);
    $this->assertSoftDeleted('comments', ['id' => $comment->id]);
});

// ============================================================================
// PR-1 authorization tests — R-15, R-16, R-17, R-18.
//
// Each test uses a non-admin actor so the Gate::before admin hook in
// AppServiceProvider does NOT short-circuit; the dynamic 'comments.*'
// gates must independently allow or deny.
// ============================================================================

// R-15: POST /api/incidents/{id}/comments requires comments.create.

it('R-15 denies comment creation for user without comments.create permission', function (): void {
    // Fresh role with no pivot rows. role_id=null trips a SQLite NOT NULL
    // on users.role_id, so we synthesize a non-admin role instead.
    $noPermsRole = Role::firstOrCreate(['name' => 'rol_test_sin_permisos']);
    $stranger = User::factory()->create(['role_id' => $noPermsRole->id]);
    $this->actingAs($stranger);

    $response = $this->postJson("/api/incidents/{$this->incident->id}/comments", [
        'message' => 'Should never be persisted.',
    ]);

    $response->assertForbidden();
    $this->assertDatabaseMissing('comments', [
        'incident_id' => $this->incident->id,
        'message' => 'Should never be persisted.',
    ]);
});

// R-16: GET /api/incidents/{id}/comments requires comments.view.
// (Existing "lists comments for an incident" test covers the allow path.)

it('R-16 denies comment listing for user without comments.view permission', function (): void {
    // Fresh role with no pivot rows — mirrors R-15's seam. The original
    // description referenced operador_organizacion (role 4), but that role
    // now grants comments.view per RolePermissionSeeder, which would let
    // the index route return 200. Use a no-permission role so the gate
    // truly denies comments.view without ambiguity.
    $noPermsRole = Role::firstOrCreate(['name' => 'rol_test_sin_permisos']);
    $stranger = User::factory()->create(['role_id' => $noPermsRole->id]);
    $this->actingAs($stranger);

    // Real comment so the 0-row case doesn't trivially satisfy assertForbidden.
    Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'A real comment',
    ]);

    $response = $this->getJson("/api/incidents/{$this->incident->id}/comments");

    $response->assertForbidden();
});

// R-17: PUT /api/comments/{comment} requires comments.update OR ownership.

it('R-17 prevents non-owner from updating comment without comments.update permission', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Original message',
    ]);

    // usuario (role 5) only has comments.create — no comments.update.
    $stranger = User::factory()->create(['role_id' => 5]);
    $this->actingAs($stranger);

    $response = $this->putJson("/api/comments/{$comment->id}", [
        'message' => 'Hijacked message',
    ]);

    $response->assertForbidden();
    expect($comment->fresh()->message)->toBe('Original message');
});

it('R-17 allows non-owner with comments.update permission to update any comment', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Original message',
    ]);

    // operador_sistema (role 2) has comments.update. Exercises the gate,
    // not the bypass — verifies permission overrides ownership.
    $operator = User::factory()->create(['role_id' => 2]);
    $this->actingAs($operator);

    $response = $this->putJson("/api/comments/{$comment->id}", [
        'message' => 'Updated by operator',
    ]);

    $response->assertOk();
    expect($comment->fresh()->message)->toBe('Updated by operator');
});

it('R-17 allows comment owner to update their own comment without comments.update permission', function (): void {
    // Owner-override branch — the update-side mirror of the R-18 delete
    // test below. usuario (role 5) has comments.create only, no
    // comments.update, but IS the comment author. Owner override wins.
    // Without this test the owner-without-permission branch of
    // CommentPolicy::update() was never exercised: the pre-existing
    // 'updates a comment' test uses the default factory user (role_id 1,
    // admin_sistema), which Gate::before bypasses entirely before the
    // policy method ever runs.
    $owner = User::factory()->create(['role_id' => 5]);

    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $owner->id,
        'message' => 'Mine to edit',
    ]);

    $this->actingAs($owner);

    $response = $this->putJson("/api/comments/{$comment->id}", [
        'message' => 'Edited by owner',
    ]);

    $response->assertOk();
    expect($comment->fresh()->message)->toBe('Edited by owner');
});

// Cross-org IDOR — admin_organizacion/operador_organizacion (roles 3/4)
// hold comments.view/comments.update per RolePermissionSeeder, but that
// grant must not cross organization boundaries: CommentPolicy/
// CommentController must scope it the same way IncidentPolicy scopes
// incidents. See docs/Pendientes/10-enforcement-permisos-frontend.md.

it('denies a staff user from listing another organization\'s incident comments', function (): void {
    $otherOrg = Organization::create([
        'name' => 'Other Org',
        'location_id' => $this->incident->location_id,
    ]);
    $otherIncident = Incident::create([
        'incident_category_id' => $this->incident->incident_category_id,
        'organization_id' => $otherOrg->id,
        'user_id' => $this->user->id,
        'location_id' => $this->incident->location_id,
        'title' => 'Other org incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
    Comment::create([
        'incident_id' => $otherIncident->id,
        'user_id' => $this->user->id,
        'message' => 'Belongs to the other org',
    ]);

    // admin_organizacion (role 3) — organization_id must differ from
    // $otherOrg's to exercise the cross-org boundary.
    $myOrg = Organization::create([
        'name' => 'My Org',
        'location_id' => $this->incident->location_id,
    ]);
    $staff = User::factory()->create(['role_id' => 3, 'organization_id' => $myOrg->id]);
    $this->actingAs($staff);

    $response = $this->getJson("/api/incidents/{$otherIncident->id}/comments");

    $response->assertForbidden();
});

it('denies a staff user from updating another organization\'s comment', function (): void {
    $otherOrg = Organization::create([
        'name' => 'Other Org 2',
        'location_id' => $this->incident->location_id,
    ]);
    $otherIncident = Incident::create([
        'incident_category_id' => $this->incident->incident_category_id,
        'organization_id' => $otherOrg->id,
        'user_id' => $this->user->id,
        'location_id' => $this->incident->location_id,
        'title' => 'Other org incident 2',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
    $comment = Comment::create([
        'incident_id' => $otherIncident->id,
        'user_id' => $this->user->id,
        'message' => 'Original — other org',
    ]);

    $myOrg = Organization::create([
        'name' => 'My Org 2',
        'location_id' => $this->incident->location_id,
    ]);
    $staff = User::factory()->create(['role_id' => 3, 'organization_id' => $myOrg->id]);
    $this->actingAs($staff);

    $response = $this->putJson("/api/comments/{$comment->id}", [
        'message' => 'Hijacked across orgs',
    ]);

    $response->assertForbidden();
    expect($comment->fresh()->message)->toBe('Original — other org');
});

it('allows a staff user to list and update comments within their own organization', function (): void {
    $staff = User::factory()->create(['role_id' => 3, 'organization_id' => $this->incident->organization_id]);
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Same org, original',
    ]);

    $this->actingAs($staff);

    $listResponse = $this->getJson("/api/incidents/{$this->incident->id}/comments");
    $listResponse->assertOk();

    $updateResponse = $this->putJson("/api/comments/{$comment->id}", [
        'message' => 'Same org, updated',
    ]);
    $updateResponse->assertOk();
    expect($comment->fresh()->message)->toBe('Same org, updated');
});

// R-18: DELETE /api/comments/{comment} requires comments.delete OR ownership.

it('R-18 prevents non-owner from deleting comment without comments.delete permission', function (): void {
    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Do not delete',
    ]);

    // operador_sistema (role 2) has comments.update but NOT comments.delete.
    $operator = User::factory()->create(['role_id' => 2]);
    $this->actingAs($operator);

    $response = $this->deleteJson("/api/comments/{$comment->id}");

    $response->assertForbidden();
    $this->assertNotSoftDeleted('comments', ['id' => $comment->id]);
});

it('R-18 allows comment owner to delete their own comment without comments.delete permission', function (): void {
    // Owner-override branch. usuario (role 5) has comments.create only —
    // no comments.delete — but IS the comment author. Owner override wins.
    $owner = User::factory()->create(['role_id' => 5]);

    $comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $owner->id,
        'message' => 'Mine to delete',
    ]);

    $this->actingAs($owner);

    $response = $this->deleteJson("/api/comments/{$comment->id}");

    $response->assertStatus(204);
    $this->assertSoftDeleted('comments', ['id' => $comment->id]);
});

it('creates a reply comment with parent_id and returns 201', function (): void {
    $parent = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Parent comment',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'Reply comment',
            'parent_id' => $parent->id,
        ]);

    $response->assertStatus(201);
    $response->assertJsonPath('data.parent_id', $parent->id);
    $response->assertJsonPath('data.message', 'Reply comment');
});

it('allows second-level reply (depth 2)', function (): void {
    $parent = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Parent comment',
    ]);
    $reply = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'First-level reply',
        'parent_id' => $parent->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'Second-level reply',
            'parent_id' => $reply->id,
        ]);

    $response->assertStatus(201);
    $response->assertJsonPath('data.parent_id', $reply->id);
});

it('rejects third-level reply (depth 3) with 422', function (): void {
    $parent = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Parent comment',
    ]);
    $reply = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'First-level reply',
        'parent_id' => $parent->id,
    ]);
    $reply2 = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Second-level reply',
        'parent_id' => $reply->id,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'Third-level reply',
            'parent_id' => $reply2->id,
        ]);

    $response->assertStatus(422);
    $response->assertSee('No se puede responder a un comentario de segundo nivel');
});

it('rejects parent_id from different incident with 422', function (): void {
    $otherIncident = Incident::create([
        'incident_category_id' => $this->incident->incident_category_id,
        'organization_id' => $this->incident->organization_id,
        'user_id' => $this->user->id,
        'location_id' => $this->incident->location_id,
        'title' => 'Other Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
    $otherComment = Comment::create([
        'incident_id' => $otherIncident->id,
        'user_id' => $this->user->id,
        'message' => 'Other incident comment',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'Cross-incident reply',
            'parent_id' => $otherComment->id,
        ]);

    $response->assertStatus(422);
    $response->assertSee('pertenece a otra incidencia');
});

it('accepts image_ids that reference real rows in the polymorphic images table (WU8: comment_images is gone)', function (): void {
    // image_ids validates against the shared `images` table now — the
    // legacy `comment_images` table this rule used to check
    // (`exists:comment_images,id`) is dropped in WU8, and its ids don't
    // overlap with `images` ids, so the old rule would always reject a
    // real, currently-existing image id after the drop.
    $image = Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => $this->incident->id,
        'storage_path' => 'comments/1/existing.webp',
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'Attaching a pre-uploaded image',
            'image_ids' => [$image->id],
        ]);

    $response->assertStatus(201);
});

it('returns 403 unauthenticated when listing comments', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->getJson("/api/incidents/{$this->incident->id}/comments");

    // authorizeResource rejects with 403 before reaching the controller
    $response->assertStatus(403);
});

it('returns 403 unauthenticated when storing a comment', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->postJson("/api/incidents/{$this->incident->id}/comments", [
            'message' => 'No auth',
        ]);

    $response->assertStatus(403);
});

it('respects per_page parameter when listing comments', function (): void {
    Comment::create(['incident_id' => $this->incident->id, 'user_id' => $this->user->id, 'message' => 'C1']);
    Comment::create(['incident_id' => $this->incident->id, 'user_id' => $this->user->id, 'message' => 'C2']);
    Comment::create(['incident_id' => $this->incident->id, 'user_id' => $this->user->id, 'message' => 'C3']);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/incidents/{$this->incident->id}/comments?per_page=2");

    $response->assertOk();
    $response->assertJsonCount(2, 'data');
    $response->assertJsonPath('meta.per_page', 2);
    $response->assertJsonPath('meta.total', 3);
});
