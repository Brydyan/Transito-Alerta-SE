<?php

declare(strict_types=1);

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

it('creates the images table with the expected columns', function (): void {
    expect(Schema::hasTable('images'))->toBeTrue();

    expect(Schema::hasColumns('images', [
        'id',
        'imageable_type',
        'imageable_id',
        'storage_path',
        'original_name',
        'mime_type',
        'size',
        'is_thumbnail',
        'sort_order',
        'caption',
        'created_at',
        'updated_at',
    ]))->toBeTrue();
});

it('rejects a second is_thumbnail=true row for the same owner', function (): void {
    DB::table('images')->insert([
        'imageable_type' => 'incident',
        'imageable_id' => 1,
        'storage_path' => 'incidents/1/a.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    // PostgreSQL aborts the ENTIRE transaction on any statement error
    // (unlike SQLite), so the expected constraint violation below must
    // run inside its own nested transaction/SAVEPOINT — otherwise every
    // query after it in this test's outer RefreshDatabase transaction
    // fails with "current transaction is aborted", masking the real
    // assertion on the next line.
    expect(function (): void {
        DB::transaction(function (): void {
            DB::table('images')->insert([
                'imageable_type' => 'incident',
                'imageable_id' => 1,
                'storage_path' => 'incidents/1/b.webp',
                'is_thumbnail' => true,
                'sort_order' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    })->toThrow(QueryException::class);

    expect(DB::table('images')->where('imageable_type', 'incident')->where('imageable_id', 1)->count())->toBe(1);
});

it('allows multiple is_thumbnail=false rows for the same owner', function (): void {
    DB::table('images')->insert([
        'imageable_type' => 'incident',
        'imageable_id' => 2,
        'storage_path' => 'incidents/2/a.webp',
        'is_thumbnail' => false,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('images')->insert([
        'imageable_type' => 'incident',
        'imageable_id' => 2,
        'storage_path' => 'incidents/2/b.webp',
        'is_thumbnail' => false,
        'sort_order' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(DB::table('images')->where('imageable_type', 'incident')->where('imageable_id', 2)->count())->toBe(2);
});

it('allows the same owner id to have a thumbnail for different imageable types', function (): void {
    DB::table('images')->insert([
        'imageable_type' => 'incident',
        'imageable_id' => 3,
        'storage_path' => 'incidents/3/a.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('images')->insert([
        'imageable_type' => 'comment',
        'imageable_id' => 3,
        'storage_path' => 'comments/3/a.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(DB::table('images')->where('is_thumbnail', true)->count())->toBe(2);
});
