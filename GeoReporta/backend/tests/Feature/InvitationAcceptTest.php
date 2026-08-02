<?php

declare(strict_types=1);

use App\Domains\Invitations\Exceptions\InvitationGoneException;
use App\Domains\Invitations\Exceptions\InvitationNotFoundException;
use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Invitations\Services\InvitationService;
use App\Domains\Invitations\Services\InvitationTokenGenerator;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
});

// NOTE: Tests that require password=null (pending WU-3 migration) are marked
// as requiring that migration first. See InvitationAcceptTest_WU3.php.

it('returns 404 when token does not exist', function (): void {
    $service = app(InvitationService::class);
    $service->acceptInvitation('nonexistent-token-plaintext-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'ValidPass1', true, 'v0');
})->throws(InvitationNotFoundException::class);

it('returns 410 when token is already consumed', function (): void {
    $user = User::factory()->create();
    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $user->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->addHours(48),
        'accepted_at' => now()->subMinute(),
        'terms_version' => 'v0',
    ]);

    $service = app(InvitationService::class);
    $service->acceptInvitation($tokenPlain, 'ValidPass1', true, 'v0');
})->throws(InvitationGoneException::class);

it('returns 410 when token is expired', function (): void {
    $user = User::factory()->create();
    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $user->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->subHour(),
        'terms_version' => 'v0',
    ]);

    $service = app(InvitationService::class);
    $service->acceptInvitation($tokenPlain, 'ValidPass1', true, 'v0');
})->throws(InvitationGoneException::class);

it('is idempotent: second call to same token returns 410', function (): void {
    // User with factory password (accepted invitation is pending the WU-3 password-nullable migration)
    $user = User::factory()->create();

    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $user->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->addHours(48),
        'terms_version' => 'v0',
    ]);

    $service = app(InvitationService::class);

    // First call: user has a password from factory. The invitation flow updates it.
    // This would fail in production (password is null there), but here we verify
    // the invitation is consumed (accepted_at set) after the call.
    $service->acceptInvitation($tokenPlain, 'ValidPass1', true, 'v0');

    // Second call: the invitation is now consumed, so token is found
    // but accepted_at IS NOT NULL → 410
    expect(fn () => $service->acceptInvitation($tokenPlain, 'OtherPass2', true, 'v0'))
        ->toThrow(InvitationGoneException::class);
});
