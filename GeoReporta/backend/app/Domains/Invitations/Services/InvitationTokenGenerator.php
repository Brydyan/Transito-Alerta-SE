<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Services;

use Illuminate\Support\Str;

/**
 * Genera tokens de invitación seguros.
 *
 * Produce un token en plaintext (para enviar por mail/URL) y su hash
 * (para guardar en base de datos). Nunca persiste el plaintext.
 */
class InvitationTokenGenerator
{
    /**
     * Genera un par token plaintext / token hash.
     *
     * @return array{tokenPlain: string, tokenHash: string}
     */
    public function generate(): array
    {
        $tokenPlain = Str::random(64);

        return [
            'tokenPlain' => $tokenPlain,
            'tokenHash' => hash('sha256', $tokenPlain),
        ];
    }
}
