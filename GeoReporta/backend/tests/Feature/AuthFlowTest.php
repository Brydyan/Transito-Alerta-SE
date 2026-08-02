<?php

declare(strict_types=1);

use App\Domains\Auth\Shared\Services\AuthService;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'Admin']);
});

it('keeps the cookie-based auth contract working end to end', function (): void {
    $user = User::factory()->make([
        'email' => 'flow@example.com',
        'first_name' => 'Flow',
        'last_name' => 'User',
    ]);
    $user->forceFill(['id' => 22]);

    $this->mock(AuthService::class, function (MockInterface $mock) use ($user): void {
        $mock->shouldReceive('login')
            ->once()
            ->andReturn([
                'accessToken' => 'access-token-1',
                'refreshToken' => 'refresh-token-1',
                'user' => $user,
            ]);

        $mock->shouldReceive('refresh')
            ->once()
            ->withArgs(function (string $refreshToken, ?string $_ip = null, ?string $_ua = null): bool {
                return $refreshToken !== '';
            })
            ->andReturn([
                'accessToken' => 'access-token-2',
                'refreshToken' => 'refresh-token-2',
                'user' => $user,
            ]);

        $mock->shouldReceive('revokeSession')
            ->once()
            ->with('session-22');
    });

    $login = $this->postJson('/api/login', [
        'email' => 'flow@example.com',
        'password' => 'secret-password',
    ]);

    $login->assertOk()
        ->assertJson([
            'access_token' => 'access-token-1',
            'token_type' => 'Bearer',
            'expires_in' => 900,
        ])
        ->assertCookie('refresh_token');

    $refresh = $this->withoutMiddleware(EncryptCookies::class)
        ->withCookie('refresh_token', 'refresh-token-1')
        ->post('/api/auth/refresh');

    $refresh->assertOk()
        ->assertJson([
            'access_token' => 'access-token-2',
            'token_type' => 'Bearer',
            'expires_in' => 900,
        ])
        ->assertCookie('refresh_token');

    $logout = $this->withoutMiddleware()->postJson('/api/logout', [
        '_session_id' => 'session-22',
    ]);

    $logout->assertOk()
        ->assertJson([
            'message' => 'Sesión cerrada exitosamente.',
        ])
        ->assertCookieExpired('refresh_token');
});
