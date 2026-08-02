<?php

declare(strict_types=1);

namespace App\Domains\Sessions\Http\Middleware;

use App\Domains\Auth\Shared\Services\JwtService;
use App\Domains\Sessions\Repositories\SessionRepository;
use App\Domains\Users\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class JwtAuthenticate
{
    public function __construct(
        private readonly JwtService $jwtService,
        private readonly SessionRepository $sessionRepository,
    ) {}

    /**
     * Authenticate a request using a JWT Bearer token.
     *
     * Extracts the token → validates with JwtService → loads session →
     * checks revoked/expired + user_id match → loads User → sets on request.
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $header = $request->header('Authorization');

        if ($header !== null && str_starts_with($header, 'Bearer ')) {
            $tokenString = substr($header, 7);
        } else {
            // Fallback for native EventSource, which cannot set custom
            // request headers: /api/notifications/stream sets this cookie
            // at login scoped to that path only.
            $tokenString = $request->cookie('access_token');
        }

        if ($tokenString === null) {
            return response()->json([
                'message' => 'Token de autenticación no proporcionado.',
            ], Response::HTTP_UNAUTHORIZED);
        }
        $claims = $this->jwtService->validateAccessToken($tokenString);

        if ($claims === null) {
            return response()->json([
                'message' => 'Token de autenticación inválido o expirado.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $session = $this->sessionRepository->findById($claims['sid']);

        if ($session === null || ! $session->isValid()) {
            return response()->json([
                'message' => 'Sesión no encontrada o inválida.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        if ((int) $session->user_id !== (int) $claims['sub']) {
            return response()->json([
                'message' => 'La sesión no corresponde al usuario autenticado.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        /** @var User|null $user */
        $user = User::find((int) $claims['sub']);

        if ($user === null) {
            return response()->json([
                'message' => 'Usuario no encontrado.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        // Make user available to request AND to Auth facade / Gates / Policies
        $request->setUserResolver(fn () => $user);
        $request->merge(['_session_id' => $claims['sid']]);
        auth()->setUser($user);

        return $next($request);
    }
}
