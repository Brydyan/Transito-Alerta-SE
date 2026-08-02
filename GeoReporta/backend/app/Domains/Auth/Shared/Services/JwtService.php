<?php

declare(strict_types=1);

namespace App\Domains\Auth\Shared\Services;

use DateTimeImmutable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Hmac\Sha256;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Validation\Constraint\SignedWith;

class JwtService
{
    private readonly Configuration $accessConfig;

    private readonly Configuration $refreshConfig;

    private readonly string $accessExpiresIn;

    private readonly string $refreshExpiresIn;

    public function __construct()
    {
        $accessSecret = config('jwt.access_secret');
        $refreshSecret = config('jwt.refresh_secret');

        if (empty($accessSecret) || empty($refreshSecret)) {
            throw new \RuntimeException('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be configured');
        }

        $this->accessConfig = Configuration::forSymmetricSigner(
            new Sha256,
            InMemory::plainText($accessSecret),
        );

        $this->refreshConfig = Configuration::forSymmetricSigner(
            new Sha256,
            InMemory::plainText($refreshSecret),
        );

        $this->accessExpiresIn = (string) config('jwt.access_expires_in', '15m');
        $this->refreshExpiresIn = (string) config('jwt.refresh_expires_in', '7d');
    }

    public function issueAccessToken(string $userId, string $sessionId, string $email): string
    {
        $now = new DateTimeImmutable;

        return $this->accessConfig->builder()
            ->identifiedBy((string) Str::uuid())
            ->relatedTo($userId)
            ->withClaim('sid', $sessionId)
            ->withClaim('email', $email)
            ->issuedAt($now)
            ->expiresAt($now->modify($this->parseTtl($this->accessExpiresIn)))
            ->getToken($this->accessConfig->signer(), $this->accessConfig->signingKey())
            ->toString();
    }

    public function issueRefreshToken(string $userId, string $sessionId, string $email): string
    {
        $now = new DateTimeImmutable;

        return $this->refreshConfig->builder()
            ->identifiedBy((string) Str::uuid())
            ->relatedTo($userId)
            ->withClaim('sid', $sessionId)
            ->withClaim('email', $email)
            ->issuedAt($now)
            ->expiresAt($now->modify($this->parseTtl($this->refreshExpiresIn)))
            ->getToken($this->refreshConfig->signer(), $this->refreshConfig->signingKey())
            ->toString();
    }

    public function validateAccessToken(string $tokenString): ?array
    {
        return $this->validate($tokenString, $this->accessConfig);
    }

    public function validateRefreshToken(string $tokenString): ?array
    {
        return $this->validate($tokenString, $this->refreshConfig);
    }

    public function refreshTokenExpiresAt(): DateTimeImmutable
    {
        return (new DateTimeImmutable)->modify($this->parseTtl($this->refreshExpiresIn));
    }

    private function validate(string $tokenString, Configuration $config): ?array
    {
        try {
            $token = $config->parser()->parse($tokenString);

            if ($token->isExpired(new DateTimeImmutable)) {
                Log::debug('jwt.token_expired', [
                    'method' => __METHOD__,
                    'token_string_prefix' => substr($tokenString, 0, 20).'...',
                ]);

                return null;
            }

            $signedWith = new SignedWith($config->signer(), $config->signingKey());

            if (! $config->validator()->validate($token, $signedWith)) {
                Log::debug('jwt.token_invalid_signature', [
                    'method' => __METHOD__,
                    'token_string_prefix' => substr($tokenString, 0, 20).'...',
                ]);

                return null;
            }

            $claims = $token->claims();

            if (! $claims->has('sub') || ! $claims->has('sid') || ! $claims->has('email')) {
                Log::debug('jwt.token_missing_claims', [
                    'method' => __METHOD__,
                    'has_sub' => $claims->has('sub'),
                    'has_sid' => $claims->has('sid'),
                    'has_email' => $claims->has('email'),
                ]);

                return null;
            }

            return [
                'sub' => $claims->get('sub'),
                'sid' => $claims->get('sid'),
                'email' => $claims->get('email'),
            ];
        } catch (\Throwable $e) {
            Log::warning('jwt.token_validation_error', [
                'method' => __METHOD__,
                'exception' => $e->getMessage(),
                'exception_class' => get_class($e),
            ]);

            return null;
        }
    }

    /**
     * Converts "15m" → "+15 minutes", "1h" → "+1 hour", "7d" → "+7 days".
     */
    private function parseTtl(string $ttl): string
    {
        if (preg_match('/^(\d+)(m|h|d)$/', $ttl, $matches) !== 1) {
            throw new \InvalidArgumentException("Invalid TTL format: {$ttl}. Use e.g. 15m, 1h, 7d.");
        }

        $value = (int) $matches[1];
        $unit = match ($matches[2]) {
            'm' => 'minutes',
            'h' => 'hours',
            'd' => 'days',
        };

        return "+{$value} {$unit}";
    }
}
