<?php

declare(strict_types=1);

use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Invitations\Services\InvitationService;
use App\Domains\Mail\Services\MailSenderInterface;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
});

it('sends UserInvitedMail with correct accept URL when creating invitation', function (): void {
    $user = User::factory()->create(['email' => 'invitado@example.com']);

    $this->mock(MailSenderInterface::class, function (MockInterface $mock) use ($user): void {
        $mock->shouldReceive('sendUserInvitation')
            ->once()
            ->withArgs(function (User $mailedUser, string $tokenPlain) use ($user): bool {
                return $mailedUser->id === $user->id
                    && strlen($tokenPlain) === 64;
            });
    });

    $service = app(InvitationService::class);
    $service->createAndSendInvitation($user);

    $this->assertDatabaseHas('user_invitations', [
        'user_id' => $user->id,
    ]);
});

it('stores hashed token in database, not plaintext', function (): void {
    $user = User::factory()->create();

    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendUserInvitation')
            ->once();
    });

    $service = app(InvitationService::class);
    $result = $service->createAndSendInvitation($user);

    $invitation = UserInvitation::where('user_id', $user->id)->first();
    expect($invitation)->not->toBeNull();
    // Token hash must NOT be the same as the token plain
    expect($invitation->token_hash)->not->toBe($result->tokenPlain);
    // The token hash must be a valid 64-character hex string (SHA-256)
    expect($invitation->token_hash)->toMatch('/^[a-f0-9]{64}$/');
});

it('does not throw when mail sending fails (S-7 tolerance)', function (): void {
    $user = User::factory()->create();

    $this->mock(MailSenderInterface::class, function (MockInterface $mock) use ($user): void {
        $mock->shouldReceive('sendUserInvitation')
            ->once()
            ->withArgs(function (User $mailedUser, string $tokenPlain) use ($user): bool {
                return $mailedUser->id === $user->id;
            })
            ->andThrow(new RuntimeException('SMTP connection failed'));
    });

    // Should NOT propagate — invitation is still created
    $service = app(InvitationService::class);
    $result = $service->createAndSendInvitation($user);

    expect($result)->toBeInstanceOf(UserInvitation::class);
    $this->assertDatabaseHas('user_invitations', ['user_id' => $user->id]);
});
