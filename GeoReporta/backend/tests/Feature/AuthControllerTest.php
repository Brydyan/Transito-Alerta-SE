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
    // User factory references role_id; seed a placeholder role.
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
});

it('logs in and returns access tokens plus the user payload', function (): void {
    $user = User::factory()->make([
        'email' => 'admin@example.com',
        'first_name' => 'Admin',
        'last_name' => 'User',
        'phone' => '0999999999',
    ]);
    $user->forceFill(['id' => 15]);

    $this->mock(AuthService::class, function (MockInterface $mock) use ($user): void {
        $mock->shouldReceive('login')
            ->once()
            ->andReturn([
                'accessToken' => 'access-token-1',
                'refreshToken' => 'refresh-token-1',
                'user' => $user,
            ]);
    });

    $response = $this->postJson('/api/login', [
        'email' => 'admin@example.com',
        'password' => 'secret-password',
    ]);

    $response->assertOk()
        ->assertJson([
            'access_token' => 'access-token-1',
            'token_type' => 'Bearer',
            'expires_in' => 900,
            'user' => [
                'id' => 15,
                'email' => 'admin@example.com',
                'first_name' => 'Admin',
                'last_name' => 'User',
                'phone' => '0999999999',
            ],
        ])
        ->assertCookie('refresh_token');
});

it('validates login payload before touching the auth service', function (): void {
    $response = $this->postJson('/api/login', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'password']);
});

it('refreshes the access token from the refresh cookie', function (): void {
    $user = User::factory()->make(['email' => 'admin@example.com']);
    $user->forceFill(['id' => 15]);

    $this->mock(AuthService::class, function (MockInterface $mock) use ($user): void {
        $mock->shouldReceive('refresh')
            ->once()
            ->withArgs(function (string $refreshToken, ?string $ip, ?string $ua): bool {
                return $refreshToken !== '';
            })
            ->andReturn([
                'accessToken' => 'access-token-2',
                'refreshToken' => 'refresh-token-2',
                'user' => $user,
            ]);
    });

    $response = $this->withoutMiddleware(EncryptCookies::class)
        ->withCookie('refresh_token', 'refresh-token-1')
        ->post('/api/auth/refresh');

    $response->assertOk()
        ->assertJson([
            'access_token' => 'access-token-2',
            'token_type' => 'Bearer',
            'expires_in' => 900,
        ])
        ->assertCookie('refresh_token');
});

it('logs out and revokes the current session when provided', function (): void {
    $this->mock(AuthService::class, function (MockInterface $mock): void {
        $mock->shouldReceive('revokeSession')
            ->once()
            ->with('session-123');
    });

    $response = $this->withoutMiddleware()->postJson('/api/logout', [
        '_session_id' => 'session-123',
    ]);

    $response->assertOk()
        ->assertJson([
            'message' => 'Sesión cerrada exitosamente.',
        ])
        ->assertCookieExpired('refresh_token');
});

// ─── updateProfile: avatar validator (REQ-7 / H7 / SCEN-7.1..7.4) ────

it('SCEN-7.1: accepts a valid avatar.urls payload and returns 200', function (): void {
    $user = User::factory()->create([
        'email' => 'avatar@example.com',
        'first_name' => 'Old',
        'last_name' => 'Name',
        'avatar' => null,
    ]);

    $response = $this->withoutMiddleware()->actingAs($user)->putJson('/api/auth/profile', [
        'avatar' => [
            'urls' => ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
        ],
    ]);

    $response->assertOk()
        ->assertJsonPath('email', 'avatar@example.com');

    $user->refresh();
    expect($user->avatar)->toBeNull();
});

it('SCEN-7.2: rejects avatar as a string with 422 on the avatar field', function (): void {
    $user = User::factory()->create();

    $response = $this->withoutMiddleware()->actingAs($user)->putJson('/api/auth/profile', [
        'avatar' => 'not-an-array',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['avatar']);
});

it('SCEN-7.3: rejects avatar.urls over the 5-entry cap with 422 on the avatar.urls field', function (): void {
    $user = User::factory()->create();

    $response = $this->withoutMiddleware()->actingAs($user)->putJson('/api/auth/profile', [
        'avatar' => [
            'urls' => [
                'https://cdn.example.com/a.png',
                'https://cdn.example.com/b.png',
                'https://cdn.example.com/c.png',
                'https://cdn.example.com/d.png',
                'https://cdn.example.com/e.png',
                'https://cdn.example.com/f.png',
            ],
        ],
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['avatar.urls']);
});

it('SCEN-7.4: rejects a non-URL avatar.urls entry with 422 on the indexed urls field', function (): void {
    $user = User::factory()->create();

    $response = $this->withoutMiddleware()->actingAs($user)->putJson('/api/auth/profile', [
        'avatar' => [
            'urls' => ['https://cdn.example.com/a.png', 'not-a-url'],
        ],
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['avatar.urls.1']);
});
