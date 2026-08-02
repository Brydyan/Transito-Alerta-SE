<?php

declare(strict_types=1);

use App\Domains\Invitations\Models\UserInvitation;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

uses(TestCase::class);
uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Freeze time so isExpired/isPending assertions are deterministic
    Carbon::setTestNow(Carbon::create(2026, 7, 21, 12, 0, 0));
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function makeInvitation(array $attributes = []): UserInvitation
{
    return new UserInvitation(array_merge([
        'id' => 1,
        'user_id' => 1,
        'token_hash' => 'hash_'.Str::random(40),
        'expires_at' => Carbon::now()->addHours(48),
        'accepted_at' => null,
        'terms_version' => 'v0',
        'invited_by_user_id' => null,
    ], $attributes));
}

it('isPending returns true when accepted_at is null and not expired', function (): void {
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->addHours(48),
        'accepted_at' => null,
    ]);

    expect($invitation->isPending())->toBeTrue();
});

it('isPending returns false when already accepted', function (): void {
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->addHours(48),
        'accepted_at' => Carbon::now()->subHours(1),
    ]);

    expect($invitation->isPending())->toBeFalse();
});

it('isPending returns false when expired', function (): void {
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->subHour(),
        'accepted_at' => null,
    ]);

    expect($invitation->isPending())->toBeFalse();
});

it('isExpired returns true when expires_at is in the past', function (): void {
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->subHour(),
        'accepted_at' => null,
    ]);

    expect($invitation->isExpired())->toBeTrue();
});

it('isExpired returns false when expires_at is in the future', function (): void {
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->addHours(48),
    ]);

    expect($invitation->isExpired())->toBeFalse();
});

it('isExpired returns false when expired but already accepted', function (): void {
    // If already accepted, the expired flag is irrelevant (consumed takes precedence)
    $invitation = makeInvitation([
        'expires_at' => Carbon::now()->subHour(),
        'accepted_at' => Carbon::now()->subMinutes(30),
    ]);

    expect($invitation->isExpired())->toBeTrue();
});

it('accept sets accepted_at to now', function (): void {
    $invitation = makeInvitation([
        'accepted_at' => null,
    ]);

    expect($invitation->accepted_at)->toBeNull();

    $invitation->accept();

    expect($invitation->accepted_at)->not->toBeNull();
    expect($invitation->accepted_at->equalTo(Carbon::now()))->toBeTrue();
});

it('after accept, isPending returns false', function (): void {
    $invitation = makeInvitation();

    $invitation->accept();

    expect($invitation->isPending())->toBeFalse();
});
