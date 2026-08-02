<?php

declare(strict_types=1);

use App\Domains\Auth\Firebase\Contracts\FirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use App\Domains\Auth\Firebase\Services\FakeFirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Services\VerifiedFirebaseToken;
use Tests\TestCase;

uses(TestCase::class);

/**
 * The fake is the test seam for the entire /auth/google flow. Every
 * Pest feature test that exercises POST /api/auth/google binds this
 * fake to the container so the real KreaitFirebaseTokenVerifier (which
 * needs real Firebase credentials) is bypassed entirely.
 *
 * The contract: caller passes an opaque token string; the fake
 * returns a canned VerifiedFirebaseToken whose email/uid/etc. were
 * pre-registered via the constructor. Unregistered tokens MUST raise
 * InvalidFirebaseTokenException so the controller can map them to 401
 * — same behavior as the production verifier.
 */
it('returns the canned claims for a token that was registered via the constructor', function (): void {
    $fake = new FakeFirebaseTokenVerifier([
        'token-new-user@example.com' => [
            'uid' => 'firebase-uid-001',
            'email' => 'new-user@example.com',
            'email_verified' => true,
            'name' => 'New User',
            'picture' => 'https://example.com/avatar.png',
        ],
    ]);

    $token = $fake->verify('token-new-user@example.com');

    expect($token)->toBeInstanceOf(VerifiedFirebaseToken::class)
        ->and($token->uid)->toBe('firebase-uid-001')
        ->and($token->email)->toBe('new-user@example.com')
        ->and($token->emailVerified)->toBeTrue()
        ->and($token->firstName)->toBe('New')
        ->and($token->lastName)->toBe('User')
        ->and($token->pictureUrl)->toBe('https://example.com/avatar.png');
});

it('throws InvalidFirebaseTokenException for any token that was not registered', function (): void {
    $fake = new FakeFirebaseTokenVerifier([]);

    expect(fn () => $fake->verify('not-registered-token'))
        ->toThrow(InvalidFirebaseTokenException::class);
});

it('implements the FirebaseTokenVerifier contract', function (): void {
    $fake = new FakeFirebaseTokenVerifier([]);

    expect($fake)->toBeInstanceOf(FirebaseTokenVerifier::class);
});

it('parses a single-word name into first_name with an empty last_name', function (): void {
    $fake = new FakeFirebaseTokenVerifier([
        'token-mononym' => [
            'uid' => 'firebase-uid-002',
            'email' => 'mononym@example.com',
            'email_verified' => true,
            'name' => 'Cher',
        ],
    ]);

    $token = $fake->verify('token-mononym');

    expect($token->firstName)->toBe('Cher')
        ->and($token->lastName)->toBe('');
});
