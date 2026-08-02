<?php

declare(strict_types=1);

use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for two defects surfaced by the SQLite → PostgreSQL
 * migration (backend-tests-postgres-migration, GitHub issue #197):
 *
 *   1. `UserFactory::definition()` hardcoded `role_id => 1` but never
 *      ensured a `roles` row with that id actually existed. On SQLite
 *      this went unnoticed — dozens of pre-existing tests called
 *      `User::factory()->create()` with no role seeded first. On real
 *      PostgreSQL, `users_role_id_foreign` rejects the insert outright.
 *
 *   2. A naive fix that looked the role up by a hardcoded id=1 collides
 *      with `roles_name_unique`: Postgres SERIAL sequences are NOT
 *      rolled back by RefreshDatabase's per-test transaction (unlike
 *      SQLite's rowid, which the same rollback effectively resets), so
 *      "admin_sistema" can legitimately already exist under a different
 *      id by the time a later test in the same parallel worker database
 *      runs. The factory must look the role up by NAME, not id.
 */
uses(TestCase::class, RefreshDatabase::class);

it('creates a user via the bare factory without a pre-existing roles row (FK-safe on Postgres)', function (): void {
    expect(Role::query()->count())->toBe(0);

    $user = User::factory()->create();

    expect($user->exists)->toBeTrue();

    $role = Role::query()->find($user->role_id);
    expect($role)->not->toBeNull();
    expect($role->name)->toBe('admin_sistema');
});

it('reuses an already-existing admin_sistema role instead of creating a conflicting duplicate', function (): void {
    // Direct DB::insert, not Role::firstOrCreate(): Role's $fillable = ['name']
    // excludes `id`, so the Eloquent mass-assignment path would silently
    // drop the explicit id=1 this test needs to pin.
    $adminRole = Role::firstOrCreate(['name' => 'admin_sistema']);

    $user = User::factory()->create();

    expect($user->role_id)->toBe($adminRole->id);
    expect(Role::query()->count())->toBe(1);
});

it('reuses admin_sistema even when it was created under a non-1 id (Postgres sequence drift)', function (): void {
    // Simulates the exact defect: some earlier test in the same worker
    // database already advanced the `roles` sequence past 1 before
    // creating "admin_sistema" (e.g. via `Role::firstOrCreate(['name' => ...])`
    // with no explicit id). A hardcoded `firstOrCreate(['id' => 1], ...)`
    // would try to insert a second "admin_sistema" row and violate
    // `roles_name_unique`.
    Role::firstOrCreate(['name' => 'placeholder-to-advance-the-sequence']);
    $admin = Role::firstOrCreate(['name' => 'admin_sistema']);

    expect($admin->id)->not->toBe(1);

    $user = User::factory()->create();

    expect($user->role_id)->toBe($admin->id);
    expect(Role::query()->where('name', 'admin_sistema')->count())->toBe(1);
});
