<?php

declare(strict_types=1);

namespace App\Domains\Auth\Shared\Services;

use App\Domains\Auth\Local\Exceptions\EmailNotVerifiedException;
use App\Domains\Auth\Local\Exceptions\PendingInvitationException;
use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use App\Domains\Sessions\Repositories\SessionRepository;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthService
{
    public function __construct(
        private readonly JwtService $jwtService,
        private readonly SessionRepository $sessionRepository,
    ) {}

    /**
     * @return array{accessToken: string, refreshToken: string, expiresIn: int, user: User}
     *
     * @throws AuthenticationException
     * @throws EmailNotVerifiedException
     * @throws PendingInvitationException
     */
    public function login(string $email, string $password, ?string $ip, ?string $ua): array
    {
        /** @var User|null $user */
        $user = User::where('email', $email)->first();

        if ($user === null) {
            throw new AuthenticationException(
                'Las credenciales proporcionadas son incorrectas.',
                'email',
            );
        }

        if ($user->password === null) {
            throw new PendingInvitationException;
        }

        // Story sc-117 — el registro local exige que el correo esté
        // verificado antes de habilitar el login. Google Auth e invitación
        // aceptan el email verified porque ya lo garantizan aguas arriba,
        // pero los usuarios que llegan vía /register tienen
        // email_verified_at = NULL hasta que pican el enlace firmado
        // del correo. Sin esta guardia, cualquiera que sepa (o adivine)
        // una password podría iniciar sesión antes de probar ownership
        // del correo.
        if ($user->email_verified_at === null && config('auth.local.require_email_verification', true)) {
            throw new EmailNotVerifiedException;
        }

        if (! Hash::check($password, $user->password)) {
            throw new AuthenticationException(
                'Las credenciales proporcionadas son incorrectas.',
                'email',
            );
        }

        return $this->issueSession($user, $ip, $ua);
    }

    /**
     * @return array{accessToken: string, refreshToken: string, expiresIn: int, user: User}
     */
    public function issueSession(User $user, ?string $ip, ?string $ua): array
    {
        $sessionId = (string) Str::uuid();

        $accessToken = $this->jwtService->issueAccessToken(
            (string) $user->id,
            $sessionId,
            $user->email,
        );

        $refreshToken = $this->jwtService->issueRefreshToken(
            (string) $user->id,
            $sessionId,
            $user->email,
        );

        $this->sessionRepository->create(
            userId: (string) $user->id,
            refreshHash: Hash::make($refreshToken),
            ip: $ip,
            ua: $ua,
            expiresAt: Carbon::instance($this->jwtService->refreshTokenExpiresAt()),
            id: $sessionId,
        );

        return [
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken,
            'expiresIn' => 900,
            'user' => $user,
        ];
    }

    /**
     * @return array{accessToken: string, refreshToken: string, expiresIn: int, user: User}
     *
     * @throws AuthenticationException
     */
    public function refresh(string $refreshToken, ?string $ip, ?string $ua): array
    {
        if ($refreshToken === '') {
            throw new AuthenticationException('No se encontró el token de refresco.');
        }

        $claims = $this->jwtService->validateRefreshToken($refreshToken);

        if ($claims === null) {
            throw new AuthenticationException('El token de refresco es inválido o ha expirado.');
        }

        $session = $this->sessionRepository->findById($claims['sid']);

        if ($session === null || ! $session->isValid()) {
            throw new AuthenticationException('La sesión no es válida o ha sido revocada.');
        }

        if ((int) $session->user_id !== (int) $claims['sub']) {
            throw new AuthenticationException('El token de refresco no corresponde a la sesión.');
        }

        if (! Hash::check($refreshToken, $session->refresh_token_hash)) {
            throw new AuthenticationException('El token de refresco no coincide con nuestros registros.');
        }

        /** @var User|null $user */
        $user = User::find((int) $claims['sub']);

        if ($user === null) {
            throw new AuthenticationException('Usuario no encontrado.');
        }

        $newAccess = $this->jwtService->issueAccessToken(
            (string) $user->id,
            $session->id,
            $user->email,
        );

        $newRefresh = $this->jwtService->issueRefreshToken(
            (string) $user->id,
            $session->id,
            $user->email,
        );

        $this->sessionRepository->update(
            id: $session->id,
            newHash: Hash::make($newRefresh),
            ip: $ip,
            ua: $ua,
            expiresAt: Carbon::instance($this->jwtService->refreshTokenExpiresAt()),
        );

        return [
            'accessToken' => $newAccess,
            'refreshToken' => $newRefresh,
            'expiresIn' => 900,
            'user' => $user,
        ];
    }

    public function revokeSession(string $sessionId): void
    {
        $this->sessionRepository->revoke($sessionId);
    }
}
