<?php

declare(strict_types=1);

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for a production defect surfaced by the SQLite →
 * PostgreSQL test migration (backend-tests-postgres-migration, GitHub
 * issue #197): `RoleSeeder` used `Role::query()->updateOrCreate(['id' =>
 * N], $role)`, but `Role::$fillable = ['name']` excludes `id` — the
 * Eloquent mass-assignment path silently dropped the explicit id on
 * create and let auto-increment assign the next free slot instead.
 *
 * On a pristine, never-seeded database this happened to still land on
 * ids 1-5 (first five inserts in table order), so the bug was invisible.
 * Any deploy where `roles` already contained rows before the seeder ran
 * (e.g. re-running seeders, or a role manually created first) would
 * silently create 5 roles with the WRONG ids instead of upserting rows
 * 1-5 — every FK that hardcodes `role_id: 1` (admin_sistema) elsewhere
 * in the app would then point at the wrong role.
 */
uses(TestCase::class, RefreshDatabase::class);

it('seeds all five roles with their pinned ids on a fresh table', function (): void {
    (new RoleSeeder)->run();

    expect(Role::query()->count())->toBe(5);
    expect(Role::query()->find(1)?->name)->toBe(UserRole::AdminSistema->value);
    expect(Role::query()->find(2)?->name)->toBe(UserRole::OperadorSistema->value);
    expect(Role::query()->find(3)?->name)->toBe(UserRole::AdminOrganizacion->value);
    expect(Role::query()->find(4)?->name)->toBe(UserRole::OperadorOrganizacion->value);
    expect(Role::query()->find(5)?->name)->toBe(UserRole::Usuario->value);
});

it('still lands on the pinned ids even when the roles sequence has already advanced', function (): void {
    // Simulates a deploy where something else already inserted into
    // `roles` before the seeder ran, advancing the id sequence past 5.
    Role::firstOrCreate(['name' => 'some-earlier-role']);
    Role::firstOrCreate(['name' => 'another-earlier-role']);

    (new RoleSeeder)->run();

    expect(Role::query()->find(1)?->name)->toBe(UserRole::AdminSistema->value);
    expect(Role::query()->find(5)?->name)->toBe(UserRole::Usuario->value);
});

it('is idempotent — running it twice does not duplicate or renumber roles', function (): void {
    (new RoleSeeder)->run();
    (new RoleSeeder)->run();

    expect(Role::query()->count())->toBe(5);
    expect(Role::query()->find(1)?->name)->toBe(UserRole::AdminSistema->value);
});

it('leaves the id sequence in sync so a real Role::firstOrCreate() afterwards does not collide', function (): void {
    // The seeder pins ids 1-5 via a raw DB::insert (Role::$fillable
    // excludes `id`, see the class docblock above). On PostgreSQL that
    // raw insert does NOT advance `roles_id_seq` — a subsequent Eloquent
    // `Role::firstOrCreate()` (the real path RoleController::store() uses in
    // production) relies on `nextval()`, which would otherwise still
    // return 1 and collide with the row the seeder just pinned there.
    (new RoleSeeder)->run();

    $role = Role::firstOrCreate(['name' => 'a-brand-new-role']);

    expect($role->id)->toBeGreaterThan(5);
});
