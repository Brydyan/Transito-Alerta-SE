<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Services;

final readonly class VerifiedFirebaseToken
{
    public function __construct(
        public string $uid,
        public string $email,
        public bool $emailVerified,
        public string $firstName,
        public string $lastName,
        public ?string $pictureUrl,
    ) {}
}
