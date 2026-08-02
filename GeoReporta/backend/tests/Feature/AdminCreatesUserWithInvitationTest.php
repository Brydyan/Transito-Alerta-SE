<?php

declare(strict_types=1);

use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Mail\Services\MailSenderInterface;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
    $this->withoutMiddleware(JwtAuthenticate::class);
});

it('returns 422 when admin sends password in payload', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminRoleId]);

    $response = $this->actingAs($admin)->postJson('/api/users', [
        'email' => 'new@example.com',
        'password' => 'SomePassword1', // prohibited field
        'role_id' => $this->adminRoleId,
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password'])
        ->assertJson([
            'errors' => [
                'password' => ['El usuario recibirá un mail para establecer su contraseña.'],
            ],
        ]);
});

it('returns 422 when admin sends password_confirmation in payload', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminRoleId]);

    $response = $this->actingAs($admin)->postJson('/api/users', [
        'email' => 'new@example.com',
        'password_confirmation' => 'SomePassword1', // prohibited helper field
        'role_id' => $this->adminRoleId,
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
    ]);

    // password_confirmation alone should also be rejected as unexpected field
    $response->assertStatus(422);
});

it('creates user without password and sends invitation mail', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminRoleId]);

    $this->actingAs($admin);

    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendUserInvitation')
            ->once()
            ->withArgs(function (User $user, string $tokenPlain): bool {
                return $user->email === 'new@example.com'
                    && strlen($tokenPlain) === 64;
            });
    });

    $response = $this->postJson('/api/users', [
        'email' => 'new@example.com',
        'role_id' => $this->adminRoleId,
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
    ]);

    $response->assertStatus(201);

    $user = User::where('email', 'new@example.com')->first();
    expect($user)->not->toBeNull()
        ->and($user->password)->toBeNull()
        ->and($user->email_verified_at)->toBeNull()
        ->and($user->terms_accepted_at)->toBeNull();

    // Invitation record was created
    expect(UserInvitation::where('user_id', $user->id)->exists())->toBeTrue();
});

it('user is created with null password and invitation record exists', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminRoleId]);

    $this->actingAs($admin);

    $response = $this->postJson('/api/users', [
        'email' => 'aftercommit@example.com',
        'role_id' => $this->adminRoleId,
        'first_name' => 'Carlos',
        'last_name' => 'García',
    ]);

    $response->assertStatus(201);

    // Verify user is created with password=null
    $user = User::where('email', 'aftercommit@example.com')->first();
    expect($user->password)->toBeNull();

    // Invitation record was created (proves afterCommit fired)
    expect(UserInvitation::where('user_id', $user->id)->exists())->toBeTrue();
});
