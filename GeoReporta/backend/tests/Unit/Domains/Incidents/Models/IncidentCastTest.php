<?php

declare(strict_types=1);

use App\Domains\Incidents\Models\Incident;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('casts incident_category_id to int when hydrated as string', function (): void {
    $incident = new Incident;
    $incident->setRawAttributes([
        'id' => 1,
        'incident_category_id' => '3',
        'organization_id' => 1,
        'user_id' => 18,
        'location_id' => 1,
        'title' => 'Test',
        'description' => null,
        'status' => 'pending',
        'priority' => 'medium',
        'resolution_date' => null,
        'claimed_by' => null,
        'claimed_at' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($incident->getAttributes()['incident_category_id'])->toBe('3');

    expect($incident->incident_category_id)->toBeInt()
        ->and($incident->incident_category_id)->toBe(3);

    expect($incident->toArray()['incident_category_id'])->toBeInt()
        ->and($incident->toArray()['incident_category_id'])->toBe(3);
});

it('casts organization_id to int when hydrated as string', function (): void {
    $incident = new Incident;
    $incident->setRawAttributes([
        'id' => 1,
        'incident_category_id' => 1,
        'organization_id' => '7',
        'user_id' => 18,
        'location_id' => 1,
        'title' => 'Test',
        'description' => null,
        'status' => 'pending',
        'priority' => 'medium',
        'resolution_date' => null,
        'claimed_by' => null,
        'claimed_at' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($incident->getAttributes()['organization_id'])->toBe('7');

    expect($incident->organization_id)->toBeInt()
        ->and($incident->organization_id)->toBe(7);

    expect($incident->toArray()['organization_id'])->toBeInt()
        ->and($incident->toArray()['organization_id'])->toBe(7);
});

it('casts user_id to int when hydrated as string', function (): void {
    $incident = new Incident;
    $incident->setRawAttributes([
        'id' => 1,
        'incident_category_id' => 1,
        'organization_id' => 1,
        'user_id' => '42',
        'location_id' => 1,
        'title' => 'Test',
        'description' => null,
        'status' => 'pending',
        'priority' => 'medium',
        'resolution_date' => null,
        'claimed_by' => null,
        'claimed_at' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($incident->getAttributes()['user_id'])->toBe('42');

    expect($incident->user_id)->toBeInt()
        ->and($incident->user_id)->toBe(42);

    expect($incident->toArray()['user_id'])->toBeInt()
        ->and($incident->toArray()['user_id'])->toBe(42);
});
