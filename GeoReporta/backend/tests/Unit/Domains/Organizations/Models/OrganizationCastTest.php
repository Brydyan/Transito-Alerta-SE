<?php

declare(strict_types=1);

use App\Domains\Organizations\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('casts parent_id to int when hydrated as string', function (): void {
    $org = new Organization;
    $org->setRawAttributes([
        'id' => 1,
        'name' => 'Test Org',
        'location_id' => 1,
        'parent_id' => '5',
        'incident_category_id' => null,
        'max_active_claims' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($org->getAttributes()['parent_id'])->toBe('5');

    expect($org->parent_id)->toBeInt()
        ->and($org->parent_id)->toBe(5);

    expect($org->toArray()['parent_id'])->toBeInt()
        ->and($org->toArray()['parent_id'])->toBe(5);
});

it('casts incident_category_id to int when hydrated as string', function (): void {
    $org = new Organization;
    $org->setRawAttributes([
        'id' => 1,
        'name' => 'Test Org',
        'location_id' => 1,
        'parent_id' => null,
        'incident_category_id' => '2',
        'max_active_claims' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($org->getAttributes()['incident_category_id'])->toBe('2');

    expect($org->incident_category_id)->toBeInt()
        ->and($org->incident_category_id)->toBe(2);

    expect($org->toArray()['incident_category_id'])->toBeInt()
        ->and($org->toArray()['incident_category_id'])->toBe(2);
});

it('casts max_active_claims to int when hydrated as string', function (): void {
    $org = new Organization;
    $org->setRawAttributes([
        'id' => 1,
        'name' => 'Test Org',
        'location_id' => 1,
        'parent_id' => null,
        'incident_category_id' => null,
        'max_active_claims' => '10',
        'created_at' => null,
        'updated_at' => null,
    ]);

    expect($org->getAttributes()['max_active_claims'])->toBe('10');

    expect($org->max_active_claims)->toBeInt()
        ->and($org->max_active_claims)->toBe(10);

    expect($org->toArray()['max_active_claims'])->toBeInt()
        ->and($org->toArray()['max_active_claims'])->toBe(10);
});
