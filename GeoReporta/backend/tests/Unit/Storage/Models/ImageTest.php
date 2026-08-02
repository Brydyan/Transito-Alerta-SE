<?php

declare(strict_types=1);

use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('creates a row with the fillable columns and casts booleans/integers', function (): void {
    $image = Image::create([
        'imageable_type' => 'incident',
        'imageable_id' => 1,
        'storage_path' => 'incidents/1/a.webp',
        'original_name' => 'a.jpg',
        'mime_type' => 'image/webp',
        'size' => '2048',
        'is_thumbnail' => 1,
        'sort_order' => '0',
        'caption' => 'A caption',
    ]);

    $fresh = Image::find($image->id);

    expect($fresh->is_thumbnail)->toBeTrue();
    expect($fresh->size)->toBe(2048);
    expect($fresh->sort_order)->toBe(0);
    expect($fresh->storage_path)->toBe('incidents/1/a.webp');
    expect($fresh->caption)->toBe('A caption');
});

it('defaults is_thumbnail to false and sort_order to 0 when omitted', function (): void {
    $image = Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => 5,
        'storage_path' => 'comments/5/a.webp',
    ]);

    $fresh = Image::find($image->id);

    expect($fresh->is_thumbnail)->toBeFalse();
    expect($fresh->sort_order)->toBe(0);
});

it('exposes an imageable() morphTo relation', function (): void {
    $image = new Image;

    expect($image->imageable())->toBeInstanceOf(MorphTo::class);
});
