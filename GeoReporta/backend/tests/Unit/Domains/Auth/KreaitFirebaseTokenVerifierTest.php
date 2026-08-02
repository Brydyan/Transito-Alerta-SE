<?php

declare(strict_types=1);

use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use App\Domains\Auth\Firebase\Services\KreaitFirebaseTokenVerifier;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Lcobucci\JWT\Token\DataSet;
use Lcobucci\JWT\UnencryptedToken;
use Mockery\MockInterface;
use Tests\TestCase;

uses(TestCase::class);

/**
 * The concrete wrapper around Kreait's Auth contract. Tests use Mockery
 * to stand in for the Kreait SDK so the wrapper's claim-mapping and
 * exception-translation logic runs in isolation, without any network
 * call to Google's public-key endpoints.
 */
afterEach(function (): void {
    Mockery::close();
});

it('delegates to the Kreait Auth contract with the configured leeway', function (): void {
    /** @var Auth&MockInterface $auth */
    $auth = Mockery::mock(Auth::class);
    $token = unencryptedTokenWithClaims([
        'sub' => 'firebase-uid-100',
        'email' => 'linked@example.com',
        'email_verified' => true,
        'name' => 'Linked User',
        'picture' => 'https://example.com/p.png',
    ]);

    $auth->shouldReceive('verifyIdToken')
        ->once()
        ->with('some-id-token', false, 5)
        ->andReturn($token);

    $verifier = new KreaitFirebaseTokenVerifier($auth, 5);

    $verified = $verifier->verify('some-id-token');

    expect($verified->uid)->toBe('firebase-uid-100')
        ->and($verified->email)->toBe('linked@example.com')
        ->and($verified->emailVerified)->toBeTrue()
        ->and($verified->firstName)->toBe('Linked')
        ->and($verified->lastName)->toBe('User')
        ->and($verified->pictureUrl)->toBe('https://example.com/p.png');
});

it('translates FailedToVerifyToken into InvalidFirebaseTokenException (R10)', function (): void {
    /** @var Auth&MockInterface $auth */
    $auth = Mockery::mock(Auth::class);
    $auth->shouldReceive('verifyIdToken')
        ->once()
        ->andThrow(new FailedToVerifyToken('signature mismatch'));

    $verifier = new KreaitFirebaseTokenVerifier($auth, 5);

    expect(fn () => $verifier->verify('garbage'))
        ->toThrow(InvalidFirebaseTokenException::class);
});

it('returns emailVerified=false when the claim is missing or false', function (): void {
    /** @var Auth&MockInterface $auth */
    $auth = Mockery::mock(Auth::class);
    $token = unencryptedTokenWithClaims([
        'sub' => 'firebase-uid-200',
        'email' => 'unverified@example.com',
        // no email_verified claim at all
    ]);

    $auth->shouldReceive('verifyIdToken')->once()->andReturn($token);

    $verifier = new KreaitFirebaseTokenVerifier($auth, 5);

    $verified = $verifier->verify('any');

    expect($verified->emailVerified)->toBeFalse()
        ->and($verified->firstName)->toBe('')
        ->and($verified->lastName)->toBe('');
});

/**
 * Build a minimal UnencryptedToken mock for the wrapper to read claims
 * from. The Lcobucci\JWT\UnencryptedToken class is `final`, so we use a
 * partial Mockery mock to stub only the claims() method.
 */
function unencryptedTokenWithClaims(array $claims): UnencryptedToken
{
    $dataSet = new DataSet($claims, '');
    $token = Mockery::mock(UnencryptedToken::class);
    $token->shouldReceive('claims')->andReturn($dataSet);

    return $token;
}
