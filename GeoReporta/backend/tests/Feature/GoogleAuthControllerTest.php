<?php

declare(strict_types=1);

use App\Domains\Auth\Firebase\Contracts\FirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Services\FakeFirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Services\GoogleAuthService;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

/**
 * PR-2 — Backend Google authentication (POST /api/auth/google).
 *
 * Covers the spec requirements assigned to this slice:
 *   R7   new email → create user with role usuario, random password,
 *        return session
 *   R8   existing verified email → link, return session
 *   R9   existing unverified email → 401 with the spec's Spanish copy
 *   R10  invalid/expired token → 401
 *   R13b anti-elevation deny-list for the Google path
 *
 * The mock seam: every test binds a SINGLE FakeFirebaseTokenVerifier
 * with every token it needs into the container via beforeEach. The
 * route caches its controller instance across requests in the same
 * test process (Laravel's Route::$controller property), so re-binding
 * the fake mid-test would not actually swap the verifier that the
 * already-constructed controller sees — instead we register all the
 * token fixtures up front and have each scenario POST a different
 * token string.
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

    // Single fake, pre-loaded with every token this test file uses.
    // Unknown tokens → InvalidFirebaseTokenException → 401 (R10).
    $fake = new FakeFirebaseTokenVerifier([
        // R7: brand-new email
        'token-r7-new-user@example.com' => [
            'uid' => 'firebase-uid-300',
            'email' => 'newuser@example.com',
            'email_verified' => true,
            'name' => 'New User',
            'picture' => 'https://example.com/p.png',
        ],
        // R8: existing verified email
        'token-r8-verified@example.com' => [
            'uid' => 'firebase-uid-400',
            'email' => 'verified@example.com',
            'email_verified' => true,
            'name' => 'Old Name',
        ],
        // R9: existing UNVERIFIED email
        'token-r9-unverified@example.com' => [
            'uid' => 'firebase-uid-500',
            'email' => 'unverified@example.com',
            'email_verified' => true,
            'name' => 'Unverified Login Attempt',
        ],
        // R13b: each deny-list role gets its own attacker email
        'token-r13b-attacker0@example.com' => [
            'uid' => 'firebase-uid-600',
            'email' => 'attacker0@example.com',
            'email_verified' => true,
            'name' => 'Privileged Attempt 0',
        ],
        'token-r13b-attacker1@example.com' => [
            'uid' => 'firebase-uid-601',
            'email' => 'attacker1@example.com',
            'email_verified' => true,
            'name' => 'Privileged Attempt 1',
        ],
        'token-r13b-attacker2@example.com' => [
            'uid' => 'firebase-uid-602',
            'email' => 'attacker2@example.com',
            'email_verified' => true,
            'name' => 'Privileged Attempt 2',
        ],
        'token-r13b-attacker3@example.com' => [
            'uid' => 'firebase-uid-603',
            'email' => 'attacker3@example.com',
            'email_verified' => true,
            'name' => 'Privileged Attempt 3',
        ],
        // R13b link path: pre-existing admin logs in via Google
        'token-r13b-verified-admin@example.com' => [
            'uid' => 'firebase-uid-700',
            'email' => 'verified-admin@example.com',
            'email_verified' => true,
            'name' => 'Existing Admin',
        ],
    ]);

    app()->instance(FirebaseTokenVerifier::class, $fake);

    RateLimiter::clear('google:127.0.0.1');
});

// ─── R7 — new email → create user + session ───────────────────────────────

it('R7: creates a new user with role usuario for an unknown Google email and returns 200 with cookies', function (): void {
    expect(User::where('email', 'newuser@example.com')->exists())->toBeFalse();

    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'token-r7-new-user@example.com',
    ]);

    $response->assertOk()
        ->assertJsonStructure([
            'access_token',
            'token_type',
            'expires_in',
            'user' => ['id', 'email', 'first_name', 'last_name'],
        ])
        ->assertJsonPath('user.email', 'newuser@example.com')
        ->assertJsonPath('user.first_name', 'New')
        ->assertJsonPath('user.last_name', 'User')
        ->assertCookie('refresh_token');

    // New user exists, with role = usuario.
    $newUser = User::where('email', 'newuser@example.com')->firstOrFail();
    expect($newUser->role_id)
        ->toBe(Role::where('name', UserRole::Usuario->value)->value('id'))
        ->and($newUser->email_verified_at)->not->toBeNull()
        // The password must be a Hash::make() value, NOT the empty string
        // or the plaintext token — random unusable is the design's lock.
        ->and($newUser->password)->not->toBe('')
        ->and($newUser->password)->not->toBe('token-r7-new-user@example.com');
});

// ─── R8 — existing verified email → link, return session ──────────────────

it('R8: links a Google login to an existing verified email account and returns 200', function (): void {
    $existing = User::factory()->create([
        'email' => 'verified@example.com',
        'first_name' => 'Old',
        'last_name' => 'Name',
        'email_verified_at' => now(),
    ]);

    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'token-r8-verified@example.com',
    ]);

    $response->assertOk()
        ->assertJsonPath('user.email', 'verified@example.com');

    // Link path must NOT create a second user — the existing row stays.
    expect(User::where('email', 'verified@example.com')->count())->toBe(1);

    $existing->refresh();
    expect($existing->id)->toBe($existing->id); // identity preserved
});

// ─── R9 — existing UNVERIFIED email → 401 ─────────────────────────────────

it('R9: rejects a Google login for an existing UNVERIFIED email with 401 and the spec copy', function (): void {
    User::factory()->create([
        'email' => 'unverified@example.com',
        'first_name' => 'Una',
        'last_name' => 'Verificada',
        'email_verified_at' => null,
    ]);

    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'token-r9-unverified@example.com',
    ]);

    $response->assertStatus(401)
        ->assertJson([
            'message' => 'Esta cuenta ya existe, iniciá sesión con tu contraseña',
        ]);
});

// ─── R10 — invalid token → 401 ────────────────────────────────────────────

it('R10: rejects an unknown/expired Google token with 401', function (): void {
    // Token NOT registered in the beforeEach fake → fake throws InvalidFirebaseTokenException.
    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'garbage-token-not-in-fake-xxxxxxxxxxxxxxxxxxxxxxxxx',
    ]);

    $response->assertStatus(401)
        ->assertJson([
            'message' => 'Token de Google inválido',
        ]);
});

// ─── R13b — anti-elevation deny-list for the Google path ──────────────────

it('R13b: /auth/google for a new email never creates a user whose role_id belongs to the admin/operator deny-list', function (): void {
    $denyList = [
        UserRole::AdminSistema->value,
        UserRole::OperadorSistema->value,
        UserRole::AdminOrganizacion->value,
        UserRole::OperadorOrganizacion->value,
    ];

    $denyListIds = Role::query()
        ->whereIn('name', $denyList)
        ->pluck('id')
        ->all();

    expect($denyListIds)->not->toBeEmpty(
        'Test precondition: seed must include admin/operator roles to assert against',
    );

    // For every deny-list role, verify that a brand-new Google login
    // does NOT produce a user with that role — the role assignment in
    // AccountLinker is server-only, hardcoded to `usuario`.
    foreach ($denyListIds as $index => $forbiddenRoleId) {
        $email = "attacker{$index}@example.com";

        $response = $this->postJson('/api/auth/google', [
            'id_token' => "token-r13b-{$email}",
        ]);

        $response->assertOk();

        $storedRoleId = User::where('email', $email)->value('role_id');
        expect($storedRoleId)
            ->not->toBeIn($denyListIds)
            ->toBe(Role::where('name', UserRole::Usuario->value)->value('id'));

        $this->assertDatabaseMissing('users', [
            'email' => $email,
            'role_id' => $forbiddenRoleId,
        ]);
    }
});

it('R13b (link path): linking to an existing verified email never escalates that user into the admin/operator deny-list', function (): void {
    // R13 is a two-sided rule: NEW users can never be created in
    // the deny-list, AND existing users that get linked via Google
    // must keep their existing verified role (the join is by email,
    // not by sub, and the linker does NOT promote or rotate roles).
    $denyList = [
        UserRole::AdminSistema->value,
        UserRole::OperadorSistema->value,
        UserRole::AdminOrganizacion->value,
        UserRole::OperadorOrganizacion->value,
    ];

    $denyListIds = Role::query()
        ->whereIn('name', $denyList)
        ->pluck('id')
        ->all();

    // Pre-existing verified admin user — the Google login MUST link,
    // not mutate, and certainly not reset their role.
    $existingAdmin = User::factory()->create([
        'email' => 'verified-admin@example.com',
        'email_verified_at' => now(),
        'role_id' => Role::where('name', UserRole::AdminSistema->value)->value('id'),
    ]);

    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'token-r13b-verified-admin@example.com',
    ]);

    $response->assertOk();

    // No new row was created — still exactly the one admin.
    expect(User::where('email', 'verified-admin@example.com')->count())->toBe(1);

    $existingAdmin->refresh();
    expect($existingAdmin->role_id)
        ->toBe(Role::where('name', UserRole::AdminSistema->value)->value('id'))
        ->toBeIn($denyListIds); // sanity: they ARE the admin they were before
});

it('logs unexpected exceptions and returns 500 when an unhandled error occurs', function (): void {
    Log::spy();

    $this->mock(GoogleAuthService::class)
        ->shouldReceive('login')
        ->andThrow(new RuntimeException('Unexpected database or system error'));

    $response = $this->postJson('/api/auth/google', [
        'id_token' => 'valid-format-token',
    ]);

    $response->assertStatus(500)
        ->assertJson(['message' => 'Error interno al procesar la autenticación con Google.']);

    Log::shouldHaveReceived('error')
        ->once()
        ->with('auth.google.unexpected_error', Mockery::subset([
            'exception' => 'Unexpected database or system error',
        ]));
});
