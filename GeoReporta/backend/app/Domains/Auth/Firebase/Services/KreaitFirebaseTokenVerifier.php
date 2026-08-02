<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Services;

use App\Domains\Auth\Firebase\Contracts\FirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use Kreait\Firebase\Contract\Auth as KreaitAuth;
use Kreait\Firebase\Exception\Auth as KreaitAuthException;

final class KreaitFirebaseTokenVerifier implements FirebaseTokenVerifier
{
    public function __construct(
        private readonly KreaitAuth $auth,
        private readonly int $leewayInSeconds = 5,
    ) {}

    public function verify(string $idToken): VerifiedFirebaseToken
    {
        try {
            $token = $this->auth->verifyIdToken(
                $idToken,
                checkIfRevoked: false,
                leewayInSeconds: $this->leewayInSeconds,
            );
        } catch (KreaitAuthException\FailedToVerifyToken) {
            throw new InvalidFirebaseTokenException;
        } catch (KreaitAuthException\RevokedIdToken) {
            throw new InvalidFirebaseTokenException;
        }

        $claims = $token->claims()->all();

        $name = (string) ($claims['name'] ?? '');
        $firstName = '';
        $lastName = '';
        if ($name !== '') {
            $parts = preg_split('/\s+/', $name, 2);
            $firstName = (string) ($parts[0] ?? '');
            $lastName = (string) ($parts[1] ?? '');
        }

        return new VerifiedFirebaseToken(
            uid: (string) ($claims['sub'] ?? ''),
            email: (string) ($claims['email'] ?? ''),
            emailVerified: (bool) ($claims['email_verified'] ?? false),
            firstName: $firstName,
            lastName: $lastName,
            pictureUrl: isset($claims['picture']) ? (string) $claims['picture'] : null,
        );
    }
}
