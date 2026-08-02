<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Jobs\SyncIncidentToRedisJob;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\ReadModels\IncidentFeedSerializer;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    // insertOrIgnore with pinned id and assert the role exists after setup.
    // Fail setup if the expected role is missing (better than silent test pass
    // with wrong permissions).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
    ]);
    $adminRole = Role::where('name', 'admin_sistema')->first();
    expect($adminRole)->not->toBeNull();

    $user = User::factory()->create(['role_id' => $adminRole->id]);
    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $organization = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Test Category', 'organization_id' => $organization->id]);

    $this->incident = Incident::withoutEvents(fn (): Incident => Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $organization->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Traffic light outage',
        'status' => 'pending',
        'priority' => 'medium',
    ]));
});

it('reconciles the current incident state into Redis idempotently', function (): void {
    Redis::shouldReceive('hset')
        ->twice()
        ->withArgs(fn (string $key, string $id, string $payload): bool => $key === 'feed:v2:items'
            && $id === (string) $this->incident->id
            && json_decode($payload, true)['title'] === 'Traffic light outage');

    Redis::shouldReceive('zadd')
        ->twice()
        ->with('feed:v2:index', Mockery::any(), (string) $this->incident->id);

    $job = new SyncIncidentToRedisJob($this->incident->id);
    $serializer = new IncidentFeedSerializer;

    $job->handle($serializer);
    $job->handle($serializer);
});

it('removes a soft-deleted incident from Redis', function (): void {
    Incident::withoutEvents(fn () => $this->incident->delete());

    Redis::shouldReceive('hdel')
        ->once()
        ->with('feed:v2:items', (string) $this->incident->id);

    Redis::shouldReceive('zrem')
        ->once()
        ->with('feed:v2:index', (string) $this->incident->id);

    (new SyncIncidentToRedisJob($this->incident->id))->handle(new IncidentFeedSerializer);
});

it('removes a force-deleted incident without model deserialization', function (): void {
    $incidentId = $this->incident->id;
    Incident::withoutEvents(fn () => $this->incident->forceDelete());

    Redis::shouldReceive('hdel')
        ->once()
        ->with('feed:v2:items', (string) $incidentId);

    Redis::shouldReceive('zrem')
        ->once()
        ->with('feed:v2:index', (string) $incidentId);

    (new SyncIncidentToRedisJob($incidentId))->handle(new IncidentFeedSerializer);
});

it('lets Redis failures escape so the queue can retry the projection', function (): void {
    Redis::shouldReceive('hset')
        ->once()
        ->andThrow(new RuntimeException('Connection refused'));

    Redis::shouldReceive('zadd')->never();

    expect(fn () => (new SyncIncidentToRedisJob($this->incident->id))->handle(new IncidentFeedSerializer))
        ->toThrow(RuntimeException::class, 'Connection refused');
});
