<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Services;

use App\Domains\Auth\Firebase\Contracts\FirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;

final class FakeFirebaseTokenVerifier implements FirebaseTokenVerifier
{
    /**
     * @param  array<string, array<string, mixed>>  $tokensById
     */
    public function __construct(
        private readonly array $tokensById = [],
    ) {}

    public function verify(string $idToken): VerifiedFirebaseToken
    {
        if (! array_key_exists($idToken, $this->tokensById)) {
            throw new InvalidFirebaseTokenException;
        }

        $claims = $this->tokensById[$idToken];

        $name = (string) ($claims['name'] ?? '');
        $firstName = '';
        $lastName = '';
        if ($name !== '') {
            $parts = preg_split('/\s+/', $name, 2);
            $firstName = (string) ($parts[0] ?? '');
            $lastName = (string) ($parts[1] ?? '');
        }

        return new VerifiedFirebaseToken(
            uid: (string) ($claims['uid'] ?? ''),
            email: (string) ($claims['email'] ?? ''),
            emailVerified: (bool) ($claims['email_verified'] ?? false),
            firstName: $firstName,
            lastName: $lastName,
            pictureUrl: isset($claims['picture']) ? (string) $claims['picture'] : null,
        );
    }
}
