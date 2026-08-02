<?php

declare(strict_types=1);

use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Mail\Messages\UserInvitedMail;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
    $this->adminRoleId = Role::where('name', 'admin_sistema')->first()->id;
    $this->withoutMiddleware(JwtAuthenticate::class);
});

it('full invitation flow: admin creates user → invitation sent → token accepted → user can login', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminRoleId]);
    $this->actingAs($admin);

    // ── Step 1: Admin creates user → user.password=null, invitation created, mail sent ──
    Mail::fake();

    $createResponse = $this->postJson('/api/users', [
        'email' => 'invitado@example.com',
        'role_id' => $this->adminRoleId,
        'first_name' => 'Invitado',
        'last_name' => 'Usuario',
    ]);

    $createResponse->assertStatus(201);

    $user = User::where('email', 'invitado@example.com')->first();
    expect($user->password)->toBeNull()
        ->and($user->email_verified_at)->toBeNull()
        ->and($user->terms_accepted_at)->toBeNull();

    // Invitation was created
    expect(UserInvitation::where('user_id', $user->id)->exists())->toBeTrue();

    // Mail was dispatched
    Mail::assertSent(UserInvitedMail::class, function (UserInvitedMail $mailable) use ($user): bool {
        return $mailable->user->id === $user->id;
    });

    // Extract the invitation token from the sent mail
    /** @var UserInvitedMail $mailable */
    $mailable = Mail::sent(UserInvitedMail::class)[0];
    $tokenPlain = $mailable->tokenPlain;
    expect(strlen($tokenPlain))->toBe(64);

    // ── Step 2: Accept invitation with token, password, and T&C ──
    $acceptResponse = $this->postJson('/api/invitations/accept', [
        'token' => $tokenPlain,
        'password' => 'NewPassword1',
        'password_confirmation' => 'NewPassword1',
        'accept_terms' => true,
        'terms_version' => 'v0',
    ]);

    $acceptResponse->assertOk()
        ->assertJson(['message' => 'Cuenta activada']);

    // ── Step 3: User now has password_hash, email_verified_at, terms_accepted_at ──
    $user->refresh();
    expect($user->password)->not->toBeNull()
        ->and(password_verify('NewPassword1', $user->password))->toBeTrue()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->terms_accepted_at)->not->toBeNull()
        ->and($user->terms_version)->toBe('v0');

    // Invitation is now marked as consumed
    expect(UserInvitation::where('user_id', $user->id)->first()->accepted_at)->not->toBeNull();

    // ── Step 4: User can now login with the new password ──
    $loginResponse = $this->postJson('/api/login', [
        'email' => 'invitado@example.com',
        'password' => 'NewPassword1',
    ]);

    $loginResponse->assertStatus(200)
        ->assertJsonStructure([
            'access_token',
            'token_type',
            'expires_in',
            'user',
        ]);

    // ── Step 5: Same token cannot be used again ──
    $reuseResponse = $this->postJson('/api/invitations/accept', [
        'token' => $tokenPlain,
        'password' => 'AnotherPass1',
        'password_confirmation' => 'AnotherPass1',
        'accept_terms' => true,
        'terms_version' => 'v0',
    ]);

    $reuseResponse->assertStatus(410)
        ->assertJson(['message' => 'Invitación ya utilizada']);
});
