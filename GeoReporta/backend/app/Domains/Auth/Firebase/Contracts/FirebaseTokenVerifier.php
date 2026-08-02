<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Contracts;

use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use App\Domains\Auth\Firebase\Services\VerifiedFirebaseToken;

interface FirebaseTokenVerifier
{
    /**
     * @throws InvalidFirebaseTokenException
     */
    public function verify(string $idToken): VerifiedFirebaseToken;
}
