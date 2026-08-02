<?php

declare(strict_types=1);

use App\Domains\Auth\Local\Exceptions\PendingInvitationException;
use App\Domains\Auth\Shared\Services\AuthService;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $this->withoutMiddleware(JwtAuthenticate::class);
});

it('returns 401 with specific message when user password is null', function (): void {
    // Create user directly with null password (bypassing the normal creation flow)
    $user = User::factory()->make([
        'email' => 'pending@example.com',
        'first_name' => 'Pending',
        'last_name' => 'User',
    ]);
    $user->forceFill(['password' => null])->save();

    $response = $this->postJson('/api/login', [
        'email' => 'pending@example.com',
        'password' => 'any-password-123',
    ]);

    $response->assertStatus(401)
        ->assertJson([
            'message' => 'Cuenta pendiente de activación. Revisá tu mail para completar el registro.',
        ]);
});

it('returns 422 when password does not match for a valid user', function (): void {
    // LoginRequest validates credentials before reaching AuthService.
    // This is existing behavior; wrong password → 422 via ValidationException.
    // Story sc-117 — EmailNotVerifiedException se chequea en AuthService.login,
    // pero como en estos tests el foco es el password guard, marcamos
    // email_verified_at para mantener la suite enfocada en su objetivo.
    $user = User::factory()->create([
        'email' => 'valid@example.com',
        'password' => 'CorrectPass1',
        'email_verified_at' => now(),
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'valid@example.com',
        'password' => 'WrongPassword1',
    ]);

    // Existing behavior: AuthenticationException → toValidationException → 422
    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

it('returns 200 when password matches for a valid user', function (): void {
    $user = User::factory()->create([
        'email' => 'valid@example.com',
        'password' => 'CorrectPass1',
        // Story sc-117 — unverified email ahora bloquea login con 403;
        // aqui seteamos verified para mantener la suite enfocada en el
        // password guard.
        'email_verified_at' => now(),
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'valid@example.com',
        'password' => 'CorrectPass1',
    ]);

    // Should return 200 with tokens
    $response->assertStatus(200)
        ->assertJsonStructure([
            'access_token',
            'token_type',
            'expires_in',
        ]);
});

it('AuthService throws PendingInvitationException when password is null', function (): void {
    $user = User::factory()->make([
        'email' => 'service-test@example.com',
        'first_name' => 'Service',
        'last_name' => 'Test',
    ]);
    $user->forceFill(['password' => null])->save();

    $authService = app(AuthService::class);

    expect(fn () => $authService->login(
        'service-test@example.com',
        'any-password',
        null,
        null
    ))->toThrow(PendingInvitationException::class);
});
