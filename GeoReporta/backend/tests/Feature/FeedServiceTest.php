<?php

declare(strict_types=1);

use App\Domains\Incidents\Models\FeedService;
use Illuminate\Support\Facades\Redis;

// SCEN-4.1: ≤ 2 Redis ops at N=500
it('performs at most 2 Redis operations when v2 keys exist', function (): void {
    $items = [];
    for ($i = 1; $i <= 500; $i++) {
        $items[(string) $i] = json_encode([
            'id' => (string) $i,
            'incident_category_id' => '1',
            'organization_id' => '1',
            'user_id' => '1',
            'location_id' => '1',
            'status' => 'pending',
            'priority' => 'medium',
            'resolution_date' => null,
            'created_at' => now()->subMinutes(500 - $i)->toIso8601String(),
            'updated_at' => now()->subMinutes(500 - $i)->toIso8601String(),
            'geom' => null,
            'category_name' => 'Category',
            'organization_name' => 'Org',
            'location_name' => 'Loc',
            'location_path_ids' => json_encode([1]),
            'user_first_name' => 'John',
            'user_last_name' => 'Doe',
            'user_avatar' => null,
        ]);
    }

    $sortedIds = range(500, 1);

    Redis::shouldReceive('zrevrange')
        ->once()
        ->with('feed:v2:index', 0, 499)
        ->andReturn($sortedIds);

    Redis::shouldReceive('hgetall')
        ->once()
        ->with('feed:v2:items')
        ->andReturn($items);

    $service = app(FeedService::class);
    $result = $service->getFeed(page: 1, perPage: 12);

    expect($result['data'])->toHaveCount(12);
    expect($result['meta']['total'])->toBe(500);
});

// SCEN-4.2: ordering (desc by created_at) + pagination
it('returns items ordered by created_at desc with pagination', function (): void {
    $baseTime = now()->subDays(30);
    $items = [];
    $ids = [];

    for ($i = 1; $i <= 25; $i++) {
        $id = (string) $i;
        $ids[] = $id;
        $createdAt = $baseTime->copy()->addHours($i);
        $items[$id] = json_encode([
            'id' => $id,
            'incident_category_id' => '1',
            'organization_id' => '1',
            'user_id' => '1',
            'location_id' => '1',
            'status' => 'pending',
            'priority' => 'medium',
            'resolution_date' => null,
            'created_at' => $createdAt->toIso8601String(),
            'updated_at' => $createdAt->toIso8601String(),
            'geom' => null,
            'category_name' => 'Category',
            'organization_name' => 'Org',
            'location_name' => 'Loc',
            'location_path_ids' => json_encode([1]),
            'user_first_name' => 'John',
            'user_last_name' => 'Doe',
            'user_avatar' => null,
        ]);
    }

    // ZREVRANGE returns IDs descending by score (created_at epoch = newest first)
    $sortedIds = array_reverse($ids);

    Redis::shouldReceive('zrevrange')
        ->times(3)
        ->with('feed:v2:index', 0, 499)
        ->andReturn($sortedIds);

    Redis::shouldReceive('hgetall')
        ->times(3)
        ->with('feed:v2:items')
        ->andReturn($items);

    $service = app(FeedService::class);

    // First page: 10 items (newest: 25 down to 16)
    $page1 = $service->getFeed(page: 1, perPage: 10);
    expect($page1['data'])->toHaveCount(10);
    expect($page1['meta']['total'])->toBe(25);
    expect($page1['meta']['current_page'])->toBe(1);
    expect($page1['data'][0]['id'])->toBe(25);
    expect($page1['data'][9]['id'])->toBe(16);

    // Second page: next 10 (15 down to 6)
    $page2 = $service->getFeed(page: 2, perPage: 10);
    expect($page2['data'])->toHaveCount(10);
    expect($page2['meta']['current_page'])->toBe(2);
    expect($page2['data'][0]['id'])->toBe(15);
    expect($page2['data'][9]['id'])->toBe(6);

    // Third page: remaining 5 (5 down to 1)
    $page3 = $service->getFeed(page: 3, perPage: 10);
    expect($page3['data'])->toHaveCount(5);
    expect($page3['meta']['current_page'])->toBe(3);
    expect($page3['data'][0]['id'])->toBe(5);
    expect($page3['data'][4]['id'])->toBe(1);
});

// SCEN-4.3: old prefix keys (feed:incidents, incident:*) are ignored
it('ignores old feed:incidents and incident:* keys', function (): void {
    // Only seed v2 keys — the mock for zrevrange on v2 index returns v2 items.
    // Old key items should never be queried.
    Redis::shouldReceive('zrevrange')
        ->once()
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1']);

    Redis::shouldReceive('hgetall')
        ->once()
        ->with('feed:v2:items')
        ->andReturn([
            '1' => json_encode([
                'id' => '1',
                'incident_category_id' => '1',
                'organization_id' => '1',
                'user_id' => '1',
                'location_id' => '1',
                'status' => 'pending',
                'priority' => 'medium',
                'resolution_date' => null,
                'created_at' => now()->toIso8601String(),
                'updated_at' => now()->toIso8601String(),
                'geom' => null,
                'category_name' => 'Category',
                'organization_name' => 'Org',
                'location_name' => 'Loc',
                'location_path_ids' => json_encode([1]),
                'user_first_name' => 'John',
                'user_last_name' => 'Doe',
                'user_avatar' => null,
            ]),
        ]);

    // Only v2 paths are mocked — no expectations for 'feed:incidents' or 'incident:*'
    // If the service falls back to v1 or reads old keys, Mockery will throw.

    $service = app(FeedService::class);
    $result = $service->getFeed();

    expect($result['data'])->toHaveCount(1);
    expect($result['data'][0]['id'])->toBe(1);
});

// Edge case: returns empty response when v2 index is empty
it('returns empty response when no data exists', function (): void {
    Redis::shouldReceive('zrevrange')
        ->once()
        ->with('feed:v2:index', 0, 499)
        ->andReturn([]);

    $service = app(FeedService::class);
    $result = $service->getFeed(page: 2, perPage: 10);

    expect($result['data'])->toBe([]);
    expect($result['meta']['total'])->toBe(0);
    expect($result['meta']['current_page'])->toBe(2);
});
