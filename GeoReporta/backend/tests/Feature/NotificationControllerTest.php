<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->withoutMiddleware(JwtAuthenticate::class);

    // Create roles used by the factory and by the test scenarios.
    // We use `operador_organizacion` for reporters (NOT admin) so that
    // Gate::before(...) bypass does not hide policy denials in the tests.
    //
    // Note: Role's $fillable does not include `id`, so we insert via the
    // query builder to keep the explicit ID.
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
        ['id' => 4, 'name' => 'operador_organizacion', 'created_at' => now(), 'updated_at' => now()],
    ]);

    $this->location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $placeholderOrg = Organization::create([
        'name' => 'Placeholder',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);
    $this->category = IncidentCategory::create(['name' => 'General', 'organization_id' => $placeholderOrg->id]);

    $this->reporter = User::factory()->create(['role_id' => 4]);
    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->reporter->id,
        'location_id' => $this->location->id,
        'title' => 'Test incident',
        'description' => 'Test description',
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('returns empty list when user has no notifications', function (): void {
    $this->actingAs($this->reporter);

    $response = $this->getJson('/api/notifications');

    $response->assertOk();
    $response->assertJsonPath('data', []);
    $response->assertJsonPath('unread_count', 0);
});

it('returns only the authenticated user notifications', function (): void {
    $otherUser = User::factory()->create(['role_id' => 4]);

    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'Tu incidencia fue reclamada.',
        'data' => ['claimed_by' => 99],
        'read' => false,
    ]);
    Notification::create([
        'user_id' => $otherUser->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'Otra.',
        'data' => [],
        'read' => false,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->getJson('/api/notifications');

    $response->assertOk();
    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('data.0.type', 'claim');
});

it('filters unread only when requested', function (): void {
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'A',
        'data' => [],
        'read' => false,
    ]);
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'B',
        'data' => [],
        'read' => true,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->getJson('/api/notifications?unread_only=1');

    $response->assertOk();
    $response->assertJsonCount(1, 'data');
});

it('user cannot mark as read a notification owned by another user', function (): void {
    $otherUser = User::factory()->create(['role_id' => 4]);
    $notification = Notification::create([
        'user_id' => $otherUser->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'other',
        'data' => [],
        'read' => false,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->patchJson("/api/notifications/{$notification->id}/read");

    $response->assertForbidden();
    expect($notification->fresh()->read)->toBeFalse();
});

it('user can mark their own notification as read', function (): void {
    $notification = Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'mine',
        'data' => [],
        'read' => false,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->patchJson("/api/notifications/{$notification->id}/read");

    $response->assertOk();
    expect($notification->fresh()->read)->toBeTrue();
});

it('mark all read updates all user notifications', function (): void {
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => '1',
        'data' => [],
        'read' => false,
    ]);
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => '2',
        'data' => [],
        'read' => false,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->patchJson('/api/notifications/read-all');

    $response->assertOk();
    $response->assertJsonPath('updated', 2);
    $response->assertJsonPath('unread_count', 0);
});

it('unread count endpoint returns correct count', function (): void {
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'A',
        'data' => [],
        'read' => false,
    ]);
    Notification::create([
        'user_id' => $this->reporter->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Claim->value,
        'message' => 'B',
        'data' => [],
        'read' => true,
    ]);

    $this->actingAs($this->reporter);
    $response = $this->getJson('/api/notifications/unread-count');

    $response->assertOk();
    $response->assertJsonPath('unread_count', 1);
});
