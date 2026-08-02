<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Services;

use App\Domains\Auth\Firebase\Contracts\FirebaseTokenVerifier;
use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use App\Domains\Auth\Firebase\Exceptions\RejectedUnverifiedException;
use App\Domains\Auth\Shared\Services\AuthService;
use Illuminate\Support\Facades\Log;

class GoogleAuthService
{
    public function __construct(
        private readonly FirebaseTokenVerifier $verifier,
        private readonly AccountLinker $linker,
        private readonly AuthService $authService,
    ) {}

    /**
     * @return array{accessToken: string, refreshToken: string, expiresIn: int, user: User}
     *
     * @throws InvalidFirebaseTokenException
     * @throws RejectedUnverifiedException
     */
    public function login(string $idToken, ?string $ip, ?string $ua): array
    {
        $token = $this->verifier->verify($idToken);

        $user = $this->linker->linkOrCreate($token);

        Log::info($user->wasRecentlyCreated ? 'auth.google.created' : 'auth.google.linked', [
            'user_id' => $user->id,
            'email_hash' => hash('sha256', (string) $user->email),
        ]);

        return $this->authService->issueSession($user, $ip, $ua);
    }
}
