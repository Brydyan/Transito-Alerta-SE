<?php

declare(strict_types=1);

use App\Domains\Incidents\Models\FeedService;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

uses(TestCase::class);

it('returns empty feed when Redis has no incidents', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn([]);

    $service = new FeedService;
    $result = $service->getFeed();

    expect($result['data'])->toBeEmpty()
        ->and($result['meta']['total'])->toBe(0)
        ->and($result['meta']['current_page'])->toBe(1);
});

it('fetches and parses incidents from Redis v2 hash', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2']);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => json_encode([
                'id' => '1',
                'incident_category_id' => '10',
                'organization_id' => '5',
                'user_id' => '3',
                'location_id' => '100',
                'status' => 'pending',
                'priority' => 'high',
                'resolution_date' => null,
                'created_at' => '2026-06-26T10:00:00+00:00',
                'updated_at' => '2026-06-26T10:00:00+00:00',
                'geom' => '{"type":"Point","coordinates":[-78.5,-1.2]}',
                'category_name' => 'Accidente',
                'organization_name' => 'Org A',
                'location_name' => 'Quito',
                'location_path_ids' => '[1,10,100]',
                'user_first_name' => 'Juan',
                'user_last_name' => 'Pérez',
                'user_avatar' => null,
            ]),
            '2' => json_encode([
                'id' => '2',
                'incident_category_id' => '20',
                'organization_id' => '5',
                'user_id' => '4',
                'location_id' => '200',
                'status' => 'in_progress',
                'priority' => 'medium',
                'resolution_date' => null,
                'created_at' => '2026-06-25T08:00:00+00:00',
                'updated_at' => '2026-06-25T08:30:00+00:00',
                'geom' => null,
                'category_name' => 'Robo',
                'organization_name' => 'Org A',
                'location_name' => 'Guayaquil',
                'location_path_ids' => '[1,20,200]',
                'user_first_name' => 'María',
                'user_last_name' => 'Gómez',
                'user_avatar' => null,
            ]),
        ]);

    $service = new FeedService;
    $result = $service->getFeed();

    expect($result['data'])->toHaveCount(2);
    expect($result['meta'])->toMatchArray([
        'total' => 2,
        'per_page' => 12,
        'current_page' => 1,
        'last_page' => 1,
    ]);
    expect($result['data'][0]['id'])->toBe(1);
    expect($result['data'][0]['status'])->toBe('pending');
    expect($result['data'][0]['category']['name'])->toBe('Accidente');
    expect($result['data'][0]['user']['first_name'])->toBe('Juan');
    expect($result['data'][1]['id'])->toBe(2);
});

it('filters incidents by status', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2', '3']);

    $base = fn (string $id, string $status) => json_encode([
        'id' => $id,
        'incident_category_id' => '10',
        'organization_id' => '5',
        'user_id' => '3',
        'location_id' => '100',
        'status' => $status,
        'priority' => 'high',
        'created_at' => '2026-06-26T10:00:00+00:00',
        'updated_at' => '2026-06-26T10:00:00+00:00',
        'category_name' => 'Accidente',
        'organization_name' => 'Org A',
        'location_name' => 'Quito',
        'location_path_ids' => '[1,10,100]',
        'user_first_name' => 'Juan',
        'user_last_name' => 'Pérez',
    ]);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => $base('1', 'pending'),
            '2' => $base('2', 'resolved'),
            '3' => $base('3', 'pending'),
        ]);

    $service = new FeedService;
    $result = $service->getFeed(status: 'pending');

    expect($result['data'])->toHaveCount(2);
    expect($result['data'][0]['id'])->toBe(1);
    expect($result['data'][1]['id'])->toBe(3);
});

it('filters incidents by organization_id', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2']);

    $base = fn (string $id, string $orgId) => json_encode([
        'id' => $id,
        'incident_category_id' => '10',
        'organization_id' => $orgId,
        'user_id' => '3',
        'location_id' => '100',
        'status' => 'pending',
        'priority' => 'high',
        'created_at' => '2026-06-26T10:00:00+00:00',
        'updated_at' => '2026-06-26T10:00:00+00:00',
        'category_name' => 'Accidente',
        'organization_name' => 'Org A',
        'location_name' => 'Quito',
        'location_path_ids' => '[]',
        'user_first_name' => 'Juan',
        'user_last_name' => 'Pérez',
    ]);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => $base('1', '5'),
            '2' => $base('2', '10'),
        ]);

    $service = new FeedService;
    $result = $service->getFeed(organizationId: 5);

    expect($result['data'])->toHaveCount(1);
    expect($result['data'][0]['id'])->toBe(1);
});

it('filters incidents by location_id via location_path_ids', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2']);

    $base = fn (string $id, string $pathIds) => json_encode([
        'id' => $id,
        'incident_category_id' => '10',
        'organization_id' => '5',
        'user_id' => '3',
        'location_id' => '100',
        'status' => 'pending',
        'priority' => 'high',
        'created_at' => '2026-06-26T10:00:00+00:00',
        'updated_at' => '2026-06-26T10:00:00+00:00',
        'category_name' => 'Accidente',
        'organization_name' => 'Org A',
        'location_name' => 'Quito',
        'location_path_ids' => $pathIds,
        'user_first_name' => 'Juan',
        'user_last_name' => 'Pérez',
    ]);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => $base('1', '[1,10,100,999]'),
            '2' => $base('2', '[1,20,200]'),
        ]);

    $service = new FeedService;
    $result = $service->getFeed(locationId: 999);

    expect($result['data'])->toHaveCount(1);
    expect($result['data'][0]['id'])->toBe(1);
});

it('paginates results correctly', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2', '3', '4', '5']);

    $base = fn (string $id) => json_encode([
        'id' => $id,
        'incident_category_id' => '10',
        'organization_id' => '5',
        'user_id' => '3',
        'location_id' => '100',
        'status' => 'pending',
        'priority' => 'high',
        'created_at' => '2026-06-26T10:00:00+00:00',
        'updated_at' => '2026-06-26T10:00:00+00:00',
        'category_name' => 'Accidente',
        'organization_name' => 'Org A',
        'location_name' => 'Quito',
        'location_path_ids' => '[]',
        'user_first_name' => 'Juan',
        'user_last_name' => 'Pérez',
    ]);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => $base('1'),
            '2' => $base('2'),
            '3' => $base('3'),
            '4' => $base('4'),
            '5' => $base('5'),
        ]);

    $service = new FeedService;
    $result = $service->getFeed(page: 2, perPage: 2);

    expect($result['data'])->toHaveCount(2)
        ->and($result['meta'])->toMatchArray([
            'current_page' => 2,
            'per_page' => 2,
            'total' => 5,
            'last_page' => 3,
            'from' => 3,
            'to' => 4,
        ]);

    expect($result['data'][0]['id'])->toBe(3);
    expect($result['data'][1]['id'])->toBe(4);
});
