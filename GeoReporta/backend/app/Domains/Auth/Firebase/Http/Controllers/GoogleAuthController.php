<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Http\Controllers;

use App\Domains\Auth\Firebase\Exceptions\InvalidFirebaseTokenException;
use App\Domains\Auth\Firebase\Exceptions\RejectedUnverifiedException;
use App\Domains\Auth\Firebase\Http\Requests\GoogleLoginRequest;
use App\Domains\Auth\Firebase\Services\GoogleAuthService;
use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use App\Domains\Users\Http\Resources\UserResource;
use App\Domains\Users\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

class GoogleAuthController
{
    private const REFRESH_COOKIE = 'refresh_token';

    private const COOKIE_PATH = '/api/auth';

    private const COOKIE_MINUTES = 60 * 24 * 30; // 30 días

    private const ACCESS_TTL = 900;

    /**
     * Mirrors the Local auth controller's access_token cookie so the
     * EventSource fallback in JwtAuthenticate works on the Google login
     * path too. See AuthController::accessCookie for the rationale.
     */
    private const ACCESS_COOKIE = 'access_token';

    private const ACCESS_COOKIE_PATH = '/api/notifications';

    public function __construct(
        private readonly GoogleAuthService $googleAuthService,
    ) {}

    public function login(GoogleLoginRequest $request): JsonResponse
    {
        try {
            $result = $this->googleAuthService->login(
                idToken: $request->validated()['id_token'],
                ip: $request->ip(),
                ua: $request->userAgent(),
            );
        } catch (InvalidFirebaseTokenException|RejectedUnverifiedException $e) {
            if ($e instanceof RejectedUnverifiedException) {
                Log::warning('auth.google.rejected_unverified', [
                    'ip' => $request->ip(),
                ]);
            } else {
                Log::warning('auth.google.token_invalid', [
                    'ip' => $request->ip(),
                ]);
            }

            return response()->json($e->toResponse(), Response::HTTP_UNAUTHORIZED);
        } catch (AuthenticationException $e) {
            return response()->json($e->toResponse(), Response::HTTP_UNAUTHORIZED);
        } catch (\Throwable $e) {
            Log::error('auth.google.unexpected_error', [
                'exception' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'message' => __('messages.google_auth_error'),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        /** @var User $user */
        $user = $result['user'];

        return response()->json([
            'access_token' => $result['accessToken'],
            'token_type' => 'Bearer',
            'expires_in' => self::ACCESS_TTL,
            'user' => new UserResource($user),
        ])
            ->withCookie($this->refreshCookie($result['refreshToken']))
            ->withCookie($this->accessCookie($result['accessToken']));
    }

    // Cookie builders

    private function refreshCookie(string $token): Cookie
    {
        return cookie(
            self::REFRESH_COOKIE,
            $token,
            self::COOKIE_MINUTES,
            self::COOKIE_PATH,
            null,
            app()->isProduction(),
            true,
            false,
            'Strict',
        );
    }

    private function accessCookie(string $token): Cookie
    {
        return cookie(
            self::ACCESS_COOKIE,
            $token,
            (int) (self::ACCESS_TTL / 60),
            self::ACCESS_COOKIE_PATH,
            null,
            app()->isProduction(),
            true,
            false,
            'Strict',
        );
    }
}
