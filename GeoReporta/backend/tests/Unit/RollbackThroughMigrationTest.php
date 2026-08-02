<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Coverage for `rollbackThroughMigration()` (tests/Pest.php), the
 * migration-name-anchored replacement for `Artisan::call('migrate:rollback',
 * ['--step' => N])` (backend-tests-postgres-migration, GitHub issue #197).
 *
 * `--step N` counts migrations from HEAD, not batches — every time a new
 * migration lands after the anchor, N silently drifts and the wrong set of
 * migrations gets rolled back. `rollbackThroughMigration(name)` derives the
 * step count from the `migrations` table itself, so it stays correct
 * regardless of how many migrations get added later.
 */
uses(TestCase::class, RefreshDatabase::class);

it('rolls back exactly through the named migration (inclusive), not any migrations before it', function (): void {
    // The real anchor this helper protects in production test files —
    // pick a migration with known successors already in this repo.
    expect(Schema::hasTable('assignments'))->toBeTrue();
    expect(Schema::hasTable('images'))->toBeTrue();

    rollbackThroughMigration('2026_07_25_000001_create_images_table');

    expect(Schema::hasTable('images'))->toBeFalse();
    // A migration BEFORE the anchor must survive the rollback.
    expect(Schema::hasTable('assignments'))->toBeTrue();
});

it('stays correct even after a later migration is added past the anchor', function (): void {
    // Simulates the exact drift bug: the anchor is not the last migration
    // in the table — at least one newer migration (this test file's own
    // migrate:fresh baseline) already exists on top of it.
    $anchor = '2026_07_25_000001_create_images_table';
    $anchorId = DB::table('migrations')->where('migration', $anchor)->value('id');
    $totalAfterAnchor = DB::table('migrations')->where('id', '>=', $anchorId)->count();

    expect($totalAfterAnchor)->toBeGreaterThan(1);

    rollbackThroughMigration($anchor);

    expect(DB::table('migrations')->where('migration', $anchor)->exists())->toBeFalse();
});

it('throws a clear error when the anchor migration is not found (e.g. renamed)', function (): void {
    expect(fn () => rollbackThroughMigration('9999_99_99_999999_does_not_exist'))
        ->toThrow(RuntimeException::class, 'Rollback anchor migration [9999_99_99_999999_does_not_exist] not found — was it renamed?');
});
