<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Seed role for UserFactory
    Role::firstOrCreate(['name' => 'Admin']);
    $adminRoleId = Role::where('name', 'Admin')->first()->id;

    $user = User::factory()->create(['role_id' => $adminRoleId]);
    $category = IncidentCategory::create(['name' => 'Test']);
    $location = Location::create(['name' => 'Test Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);

    Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
});

it('rebuilds the Redis feed from PostgreSQL', function (): void {
    config()->set('cache.feed_ttl_seconds', 86400);
    // Wipe-first pattern: FeedRebuildCommand must be authoritative, so it
    // calls Redis::del on both v2 keys before repopulating. Without this
    // expectation the Mockery facade throws BadMethodCallException because
    // del() isn't on the partial mock otherwise configured below.
    Redis::shouldReceive('del')
        ->once()
        ->with('feed:v2:items', 'feed:v2:index');

    // Pipeline for incidents: hset + zadd
    Redis::shouldReceive('pipeline')
        ->once()
        ->andReturnSelf();

    Redis::shouldReceive('hset')
        ->once()
        ->with('feed:v2:items', Mockery::type('string'), Mockery::type('string'));

    Redis::shouldReceive('zadd')
        ->once()
        ->with('feed:v2:index', Mockery::type('float'), Mockery::type('string'));

    Redis::shouldReceive('exec')
        ->once();

    Redis::shouldReceive('expire')
        ->once()
        ->with('feed:v2:items', 86400);

    Redis::shouldReceive('expire')
        ->once()
        ->with('feed:v2:index', 86400);

    $this->artisan('feed:rebuild')
        ->expectsOutputToContain('Synced 1 incidents to Redis feed v2.')
        ->assertExitCode(0);
});

it('sets comment_count absolutely so repeated rebuilds do not accumulate', function (): void {
    $incident = Incident::first();
    $author = User::factory()->create();

    Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $author->id,
        'message' => 'first',
    ]);
    Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $author->id,
        'message' => 'second',
    ]);

    Redis::shouldReceive('del')
        ->once()
        ->with('feed:v2:items', 'feed:v2:index');

    // Two pipelines: one for the incidents chunk, one for the comments chunk.
    Redis::shouldReceive('pipeline')
        ->twice()
        ->andReturnSelf();

    Redis::shouldReceive('hset')
        ->once()
        ->with('feed:v2:items', Mockery::type('string'), Mockery::type('string'));

    Redis::shouldReceive('zadd')
        ->once()
        ->with('feed:v2:index', Mockery::type('float'), Mockery::type('string'));

    Redis::shouldReceive('zadd')
        ->twice()
        ->with('incident:'.$incident->id.':comments', Mockery::type('float'), Mockery::type('string'));

    Redis::shouldReceive('hmset')
        ->twice()
        ->with(Mockery::pattern('/^comment:\d+$/'), Mockery::type('array'));

    Redis::shouldReceive('exec')
        ->twice();

    Redis::shouldReceive('expire')
        ->once()
        ->with('feed:v2:items', 604800);

    Redis::shouldReceive('expire')
        ->once()
        ->with('feed:v2:index', 604800);

    // The rebuild must write the count with HSET (absolute), never HINCRBY:
    // the incident:{id} hash is NOT wiped by the v2 del() above, so an
    // increment would stack on top of the previous rebuild's value.
    // hincrby is intentionally not mocked — any call to it fails the test.
    Redis::shouldReceive('hset')
        ->once()
        ->with('incident:'.$incident->id, 'comment_count', 2);

    $this->artisan('feed:rebuild')
        ->expectsOutputToContain('Synced 2 comments to Redis.')
        ->assertExitCode(0);
});
