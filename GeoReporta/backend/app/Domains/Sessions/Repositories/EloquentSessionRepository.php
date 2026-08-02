<?php

declare(strict_types=1);

namespace App\Domains\Sessions\Repositories;

use App\Domains\Sessions\Models\Session;
use Carbon\Carbon;
use Illuminate\Support\Str;

class EloquentSessionRepository implements SessionRepository
{
    public function create(
        string $userId,
        string $refreshHash,
        ?string $ip,
        ?string $ua,
        Carbon $expiresAt,
        ?string $id = null,
    ): Session {
        return Session::create([
            'id' => $id ?? (string) Str::uuid(),
            'user_id' => $userId,
            'refresh_token_hash' => $refreshHash,
            'ip_address' => $ip,
            'user_agent' => $ua,
            'is_revoked' => false,
            'expires_at' => $expiresAt,
        ]);
    }

    public function findById(string $id): ?Session
    {
        return Session::with('user')->find($id);
    }

    public function update(
        string $id,
        string $newHash,
        ?string $ip,
        ?string $ua,
        Carbon $expiresAt,
    ): void {
        Session::findOrFail($id)->update([
            'refresh_token_hash' => $newHash,
            'ip_address' => $ip,
            'user_agent' => $ua,
            'expires_at' => $expiresAt,
        ]);
    }

    public function revoke(string $id): void
    {
        Session::findOrFail($id)->update(['is_revoked' => true]);
    }
}
