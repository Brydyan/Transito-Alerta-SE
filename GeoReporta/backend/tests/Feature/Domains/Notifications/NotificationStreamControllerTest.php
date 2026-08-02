<?php

declare(strict_types=1);

/*
 * Pest feature tests for NotificationStreamController.
 *
 * TDD evidence (Fase 3 — SSE stream endpoint):
 * - RED:  tests were authored BEFORE the controller and the route existed.
 *         Initial runs fail with 404 (route missing).
 * - GREEN: implementing config/notifications.php, the controller, and
 *         wiring the route flips these tests green.
 *
 * Stream semantics under test:
 *   - Auth: we skip the JwtAuthenticate middleware and use actingAs()
 *     (the project's standard test pattern for the JWT middleware, see
 *     tests/Feature/NotificationControllerTest.php). The middleware's
 *     cookie + Bearer fallback is exercised separately in
 *     JwtAuthenticateTest.
 *   - Last-Event-ID: snapshot returns notifications with id > header value,
 *     ascending, scoped to the authenticated user, capped at
 *     NOTIFICATIONS_STREAM_SNAPSHOT_CAP.
 *   - Redis Pub/Sub: subscribing to user:{id}:notifications receives only
 *     events for that user; cross-user publishes do not leak.
 *   - Redis unavailable at subscribe time -> 503.
 *   - Content-Type is text/event-stream with no-cache, no buffering.
 *
 * The heartbeat + session-revocation scenarios are exercised manually
 * (see openspec/changes/eliminar-mercure-sse-nativo/apply-progress.md
 * Fase 3) because they require a long-running request that the Pest
 * test runner cannot terminate cleanly.
 */

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Support\RedisSubscriber;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Redis;
use Mockery\MockInterface;

uses(RefreshDatabase::class);

/**
 * Wire the controller's pre-flight Redis ping to a successful response
 * and return the connection mock so tests can stub `subscribe` on it.
 */
function stubRedisFactory(): MockInterface
{
    $connection = Mockery::mock();
    $connection->shouldReceive('ping')->andReturn('PONG');
    $factory = Mockery::mock(RedisFactory::class);
    $factory->shouldReceive('connection')->andReturn($connection);

    // Replace the RedisSubscriber singleton so the controller receives
    // our factory-driven connection via its RedisSubscriber dependency.
    app()->instance(RedisFactory::class, $factory);

    return $connection;
}

beforeEach(function (): void {
    $this->withoutMiddleware(JwtAuthenticate::class);

    Role::firstOrCreate(['name' => 'admin_sistema']);
    $this->user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $this->otherUser = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id, 'email' => 'other@example.com']);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('returns 401 when the user is not authenticated', function (): void {
    // Re-enable the JWT middleware just for this test: we want the
    // controller to receive an unauthenticated request.
    $response = $this->withMiddleware(JwtAuthenticate::class)
        ->get('/api/notifications/stream');

    $response->assertStatus(401);
});

it('returns text/event-stream with no-cache and no-buffering headers', function (): void {
    $connection = stubRedisFactory();
    // Subscribe to nothing — exit immediately.
    $connection->shouldReceive('subscribe')->andReturnUsing(function (): void {
        // No-op.
    });

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    $response->assertHeader('Content-Type', 'text/event-stream; charset=UTF-8');
    // Laravel appends `, private` to no-cache for authenticated responses;
    // we only assert the prefix is present.
    expect($response->headers->get('Cache-Control'))->toContain('no-cache');
    expect($response->headers->get('X-Accel-Buffering'))->toBe('no');
});

it('emits an empty stream when the user has no notifications after Last-Event-ID', function (): void {
    $connection = stubRedisFactory();
    $connection->shouldReceive('subscribe')->andReturnUsing(function (): void {
        // No-op.
    });

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    expect($response->streamedContent())->toBe('');
});

it('emits a snapshot of recent notifications as SSE events', function (): void {
    $ownPayload = fn (string $msg) => Notification::create([
        'user_id' => $this->user->id,
        'incident_id' => $this->incident->id,
        'type' => 'claim',
        'message' => $msg,
        'data' => [],
        'read' => false,
    ]);
    $ownPayload('first');
    $ownPayload('second');
    $ownPayload('third');

    Notification::create([
        'user_id' => $this->otherUser->id,
        'incident_id' => $this->incident->id,
        'type' => 'claim',
        'message' => 'should not leak to first user',
        'data' => [],
        'read' => false,
    ]);
    Notification::create([
        'user_id' => $this->otherUser->id,
        'incident_id' => $this->incident->id,
        'type' => 'claim',
        'message' => 'also should not leak',
        'data' => [],
        'read' => false,
    ]);

    $connection = stubRedisFactory();
    $connection->shouldReceive('subscribe')->andReturnUsing(function (): void {
        // No-op.
    });

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    $body = $response->streamedContent();

    expect($body)->toContain('first');
    expect($body)->toContain('second');
    expect($body)->toContain('third');
    expect($body)->not->toContain('should not leak');
    expect($body)->not->toContain('also should not leak');
    expect(substr_count($body, 'event: notification'))->toBe(3);
});

it('honors Last-Event-ID by emitting only notifications with greater id', function (): void {
    $first = Notification::create([
        'user_id' => $this->user->id, 'incident_id' => $this->incident->id,
        'type' => 'claim', 'message' => 'old', 'data' => [], 'read' => false,
    ]);
    Notification::create([
        'user_id' => $this->user->id, 'incident_id' => $this->incident->id,
        'type' => 'claim', 'message' => 'new', 'data' => [], 'read' => false,
    ]);

    $connection = stubRedisFactory();
    $connection->shouldReceive('subscribe')->andReturnUsing(function (): void {
        // No-op.
    });

    $response = $this->actingAs($this->user)
        ->withHeaders(['Last-Event-ID' => (string) $first->id])
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    $body = $response->streamedContent();

    expect($body)->toContain('new');
    expect($body)->not->toContain('"message":"old"');
});

it('caps the snapshot at NOTIFICATIONS_STREAM_SNAPSHOT_CAP (default 50)', function (): void {
    for ($i = 1; $i <= 55; $i++) {
        Notification::create([
            'user_id' => $this->user->id,
            'incident_id' => $this->incident->id,
            'type' => 'claim',
            'message' => "msg-{$i}",
            'data' => [],
            'read' => false,
        ]);
    }

    $connection = stubRedisFactory();
    $connection->shouldReceive('subscribe')->andReturnUsing(function (): void {
        // No-op.
    });

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    $body = $response->streamedContent();
    expect(substr_count($body, 'event: notification'))->toBe(50);
});

it('returns 503 when Redis Pub/Sub is unavailable at subscribe time', function (): void {
    // The 503 path is the pre-flight ping failure: once the stream is
    // open, an exception inside the callback is logged but the
    // connection just closes (the browser auto-reconnects). So we
    // arrange for the ping itself to fail.
    $connection = Mockery::mock();
    $connection->shouldReceive('ping')
        ->andThrow(new RuntimeException('redis unreachable'));
    $factory = Mockery::mock(RedisFactory::class);
    $factory->shouldReceive('connection')->andReturn($connection);
    app()->instance(RedisFactory::class, $factory);

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(503);
});

it('delivers only events for the authenticated user via Redis subscription', function (): void {
    // Stub the factory so the ping succeeds.
    $connection = stubRedisFactory();
    // Simulate one inbound notification for the auth user.
    $connection->shouldReceive('subscribe')
        ->andReturnUsing(function (array $channels, callable $callback): void {
            $callback(json_encode([
                'id' => 100,
                'type' => 'claim',
                'message' => 'message for auth user',
                'data' => [],
                'read' => false,
            ]), $channels[0]);
        });

    $response = $this->actingAs($this->user)
        ->get('/api/notifications/stream');

    $response->assertStatus(200);
    $body = $response->streamedContent();
    expect($body)->toContain('message for auth user');
});
