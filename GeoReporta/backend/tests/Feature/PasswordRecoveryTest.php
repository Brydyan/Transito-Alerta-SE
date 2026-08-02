<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Auth\Local\Notifications\PasswordResetMail;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $this->adminRoleId = Role::where('name', 'admin_sistema')->first()->id;
});

it('sends password reset link for existing user', function (): void {
    Notification::fake();

    $user = User::factory()->create([
        'email' => 'user@example.com',
        'role_id' => $this->adminRoleId,
    ]);

    $response = $this->postJson('/api/forgot-password', [
        'email' => 'user@example.com',
    ]);

    $response->assertOk();
    $response->assertJsonStructure(['message']);

    Notification::assertSentTo($user, PasswordResetMail::class);
});

it('returns success message even for non-existent email to prevent enumeration', function (): void {
    Notification::fake();

    $response = $this->postJson('/api/forgot-password', [
        'email' => 'nonexistent@example.com',
    ]);

    $response->assertOk();
    $response->assertJsonStructure(['message']);

    Notification::assertNothingSent();
});

it('validates email field in forgot-password endpoint', function (): void {
    $response = $this->postJson('/api/forgot-password', [
        'email' => 'not-an-email',
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['email']);
});

it('resets password successfully with valid token', function (): void {
    $user = User::factory()->create([
        'email' => 'user@example.com',
        'role_id' => $this->adminRoleId,
    ]);

    $token = Password::createToken($user);

    $response = $this->postJson('/api/reset-password', [
        'email' => 'user@example.com',
        'token' => $token,
        'password' => 'new-secure-password',
        'password_confirmation' => 'new-secure-password',
    ]);

    $response->assertOk();
    $response->assertJsonStructure(['message']);
});

it('fails to reset password with invalid token', function (): void {
    $user = User::factory()->create([
        'email' => 'user@example.com',
        'role_id' => $this->adminRoleId,
    ]);

    $response = $this->postJson('/api/reset-password', [
        'email' => 'user@example.com',
        'token' => 'invalid-token-123',
        'password' => 'new-secure-password',
        'password_confirmation' => 'new-secure-password',
    ]);

    $response->assertStatus(400);
});
