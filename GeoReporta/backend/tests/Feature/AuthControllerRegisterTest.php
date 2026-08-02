<?php

declare(strict_types=1);

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * PR-1 — Backend registration endpoint (POST /api/register).
 *
 * Covers the spec requirements assigned to this slice:
 *   R1   successful registration creates a user with role `usuario` and 201
 *   R2   duplicate email rejected with 422 on the `email` field
 *   R3a  password must be at least 8 characters
 *   R3b  password must contain at least one uppercase letter
 *   R3c  password must contain at least one lowercase letter
 *   R3d  password must contain at least one digit
 *   R4   password mismatch rejected with 422 on `password_confirmation`
 *   R5   client-supplied `role_id` is ignored — the user is created as `usuario`
 *   R6   `throttle:register` returns 429 after the per-minute budget
 *   R13a anti-elevation — `/register` MUST NEVER produce a user whose role
 *         belongs to the admin/operator deny-list
 */
uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RegisterService resolves the citizen role by name. Seed only the
    // roles we actually need for these tests so the deny-list in R13a is
    // exercised against a real, distinguishable set of role rows.
    //
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

    // The cache-backed rate limiter persists between requests in the same
    // test, so a leftover counter from a previous test could leak. Clear
    // the register bucket at the start of every test for isolation.
    RateLimiter::clear('register:127.0.0.1');
});

/**
 * Build a payload that satisfies every R3 rule. Tests override individual
 * fields to force specific validation failures.
 *
 * @return array<string, string>
 */
function validRegisterPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
        'email' => 'juan@example.com',
        'phone' => '0991234567',
        'password' => 'Password1',
        'password_confirmation' => 'Password1',
    ], $overrides);
}

// ─── R1 ───────────────────────────────────────────────────────────────────

it('R1: creates a user with role usuario and returns 201 with the success message', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload());

    $response->assertStatus(201)
        ->assertJson([
            'message' => 'Usuario creado correctamente',
            // Story sc-117 — 201 con `requires_verification: true` para
            // que el frontend redirija a la pantalla de verificación de
            // correo en vez de volver a /login.
            'requires_verification' => true,
        ]);

    $this->assertDatabaseHas('users', [
        'email' => 'juan@example.com',
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
    ]);
});

// ─── R2 ───────────────────────────────────────────────────────────────────

it('R2: rejects duplicate email with 422 on the email field', function (): void {
    User::factory()->create([
        'email' => 'taken@example.com',
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
    ]);

    $response = $this->postJson('/api/register', validRegisterPayload([
        'email' => 'taken@example.com',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

// ─── R3a ──────────────────────────────────────────────────────────────────

it('R3a: rejects a password under 8 characters with 422 on the password field', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload([
        'password' => 'Aa1!',
        'password_confirmation' => 'Aa1!',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

// ─── R3b ──────────────────────────────────────────────────────────────────

it('R3b: rejects a password without an uppercase letter with 422 on the password field', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload([
        'password' => 'password1',
        'password_confirmation' => 'password1',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

// ─── R3c ──────────────────────────────────────────────────────────────────

it('R3c: rejects a password without a lowercase letter with 422 on the password field', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload([
        'password' => 'PASSWORD1',
        'password_confirmation' => 'PASSWORD1',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

// ─── R3d ──────────────────────────────────────────────────────────────────

it('R3d: rejects a password without a digit with 422 on the password field', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload([
        'password' => 'Password!',
        'password_confirmation' => 'Password!',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

// ─── R4 ───────────────────────────────────────────────────────────────────

it('R4: rejects password mismatch with 422 on the password_confirmation field', function (): void {
    $response = $this->postJson('/api/register', validRegisterPayload([
        'password' => 'Password1',
        'password_confirmation' => 'Different1',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password_confirmation']);
});

// ─── R5 ───────────────────────────────────────────────────────────────────

it('R5: ignores client-supplied role_id and forces the new user to role usuario', function (): void {
    $adminRoleId = Role::where('name', UserRole::AdminSistema->value)->value('id');

    $response = $this->postJson('/api/register', validRegisterPayload([
        'role_id' => $adminRoleId,
    ]));

    $response->assertStatus(201);

    $this->assertDatabaseHas('users', [
        'email' => 'juan@example.com',
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
    ]);

    $this->assertDatabaseMissing('users', [
        'email' => 'juan@example.com',
        'role_id' => $adminRoleId,
    ]);
});

// ─── R6 ───────────────────────────────────────────────────────────────────

it('R6: throttle:register returns 429 after the per-minute budget is exhausted', function (): void {
    // `throttle:register` is set to 5/min per IP. Five distinct emails get
    // through; the 6th hits the limiter and must be rejected with 429.
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/register', validRegisterPayload([
            'email' => "user{$i}@example.com",
        ]))->assertStatus(201);
    }

    $response = $this->postJson('/api/register', validRegisterPayload([
        'email' => 'user5@example.com',
    ]));

    $response->assertStatus(429);
});

// ─── R13a — anti-elevation deny-list ─────────────────────────────────────

it('R13a: /register never creates a user whose role_id belongs to the admin/operator deny-list', function (): void {
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

    // Try every admin/operator id as the client-supplied role_id. None of
    // them may end up assigned to the resulting user.
    foreach ($denyListIds as $index => $forbiddenRoleId) {
        $email = "attacker{$index}@example.com";

        $response = $this->postJson('/api/register', validRegisterPayload([
            'email' => $email,
            'role_id' => $forbiddenRoleId,
        ]));

        $response->assertStatus(201);

        $this->assertDatabaseMissing('users', [
            'email' => $email,
            'role_id' => $forbiddenRoleId,
        ]);

        $storedRoleId = User::where('email', $email)->value('role_id');
        expect($storedRoleId)->not->toBeIn($denyListIds);
    }
});
