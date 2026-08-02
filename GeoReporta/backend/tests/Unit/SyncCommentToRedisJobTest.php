<?php

declare(strict_types=1);

use App\Domains\Comments\Jobs\SyncCommentToRedisJob;
use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
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
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $user = User::factory()->create(['id' => 3, 'role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $organization = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Test Category', 'organization_id' => $organization->id]);
    $this->incident = Incident::withoutEvents(fn (): Incident => Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $organization->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test incident',
        'status' => 'pending',
        'priority' => 'medium',
    ]));
    DB::table('comments')->insert([
        'id' => 7,
        'incident_id' => $this->incident->id,
        'user_id' => $user->id,
        'message' => 'Blocked street',
        'created_at' => now(),
        'updated_at' => now(),
    ]);
});

it('syncs an existing comment to Redis', function (): void {
    $comment = Comment::query()->findOrFail(7);
    $incidentId = $this->incident->id;
    Redis::shouldReceive('pipeline')->once()->andReturn($pipe = Mockery::mock());
    $pipe->shouldReceive('zadd')->once()->with("incident:{$incidentId}:comments", $comment->created_at->timestamp, '7');
    $pipe->shouldReceive('hmset')->once()->withArgs(fn (string $key, array $data): bool => $key === 'comment:7'
        && $data['message'] === 'Blocked street');
    $pipe->shouldReceive('hincrby')->once()->with("incident:{$incidentId}", 'comment_count', 1);
    $pipe->shouldReceive('exec')->once();

    (new SyncCommentToRedisJob(7))->handle();
});

it('removes a trashed comment from the sorted set but keeps its hash', function (): void {
    DB::table('comments')->where('id', 7)->update(['deleted_at' => now()]);
    $incidentId = $this->incident->id;
    Redis::shouldReceive('pipeline')->once()->andReturn($pipe = Mockery::mock());
    $pipe->shouldReceive('zrem')->once()->with("incident:{$incidentId}:comments", '7');
    $pipe->shouldReceive('hincrby')->once()->with("incident:{$incidentId}", 'comment_count', -1);
    $pipe->shouldReceive('exec')->once();

    (new SyncCommentToRedisJob(7))->handle();
});

it('does nothing when the comment no longer exists', function (): void {
    DB::table('comments')->where('id', 7)->delete();
    Redis::shouldReceive('pipeline')->never();

    (new SyncCommentToRedisJob(7))->handle();
});
