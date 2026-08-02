<?php

declare(strict_types=1);

namespace App\Domains\Sessions\Repositories;

use App\Domains\Sessions\Models\Session;
use Carbon\Carbon;

interface SessionRepository
{
    public function create(
        string $userId,
        string $refreshHash,
        ?string $ip,
        ?string $ua,
        Carbon $expiresAt,
        ?string $id = null,
    ): Session;

    public function findById(string $id): ?Session;

    public function update(
        string $id,
        string $newHash,
        ?string $ip,
        ?string $ua,
        Carbon $expiresAt,
    ): void;

    public function revoke(string $id): void;
}
