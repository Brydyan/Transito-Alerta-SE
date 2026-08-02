<?php

declare(strict_types=1);

use App\Domains\Auth\Local\Services\RegisterService;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * Unit-level guarantees for the role-assignment logic in
 * RegisterService. The feature suite covers the HTTP shape; this
 * suite locks the anti-elevation property at the service layer so
 * future refactors cannot silently weaken it.
 */
beforeEach(function (): void {
    // Direct DB::insert, not Role::query()->updateOrCreate(): Role's
    // $fillable = ['name'] excludes `id`, so the Eloquent mass-assignment
    // path silently drops the explicit id and lets auto-increment assign
    // whatever the sequence happens to be at (see RoleSeederTest / the
    // same convention documented in AssignmentPolicyTest.php).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 2, 'name' => UserRole::OperadorSistema->value],
        ['id' => 3, 'name' => UserRole::AdminOrganizacion->value],
        ['id' => 4, 'name' => UserRole::OperadorOrganizacion->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ]);
});

it('assigns role_id from the citizen role row, not from the payload', function (): void {
    $service = app(RegisterService::class);

    $adminRoleId = Role::where('name', UserRole::AdminSistema->value)->value('id');

    $user = $service->register([
        'first_name' => 'Ana',
        'last_name' => 'Gómez',
        'email' => 'ana@example.com',
        'phone' => '0991234567',
        'password' => 'Password1',
        'role_id' => $adminRoleId, // hostile payload — must be ignored
    ]);

    $citizenRoleId = Role::where('name', UserRole::Usuario->value)->value('id');

    expect($user->role_id)->toBe($citizenRoleId)
        ->and($user->role_id)->not->toBe($adminRoleId);

    // The same row in the DB reflects the same invariant.
    $persisted = User::where('email', 'ana@example.com')->firstOrFail();
    expect($persisted->role_id)->toBe($citizenRoleId);
});

it('creates the new user with email_verified_at = null (out of scope: no email-verification flow yet)', function (): void {
    $service = app(RegisterService::class);

    $user = $service->register([
        'first_name' => 'Bea',
        'last_name' => 'López',
        'email' => 'bea@example.com',
        'password' => 'Password1',
    ]);

    expect($user->email_verified_at)->toBeNull();
});

it('hashes the password via the User model cast (never stores the plaintext)', function (): void {
    $service = app(RegisterService::class);

    $service->register([
        'first_name' => 'Cris',
        'last_name' => 'Paz',
        'email' => 'cris@example.com',
        'password' => 'Password1',
    ]);

    $persisted = User::where('email', 'cris@example.com')->firstOrFail();

    expect($persisted->password)
        ->not->toBe('Password1') // not the raw value
        ->and(password_verify('Password1', $persisted->password))->toBeTrue();
});

it('throws a clear RuntimeException when the citizen role row is missing', function (): void {
    // Wipe the citizen role so the service MUST fail loudly instead of
    // silently defaulting to whatever the DB hands back.
    Role::where('name', UserRole::Usuario->value)->delete();

    $service = app(RegisterService::class);

    expect(fn () => $service->register([
        'first_name' => 'Dan',
        'last_name' => 'Pérez',
        'email' => 'dan@example.com',
        'password' => 'Password1',
    ]))->toThrow(RuntimeException::class);
});
