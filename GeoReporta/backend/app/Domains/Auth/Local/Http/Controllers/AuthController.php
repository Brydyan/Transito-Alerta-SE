<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Controllers;

use App\Domains\Auth\Local\Exceptions\EmailNotVerifiedException;
use App\Domains\Auth\Local\Exceptions\PendingInvitationException;
use App\Domains\Auth\Local\Http\Requests\LoginRequest;
use App\Domains\Auth\Local\Http\Requests\UpdateProfileRequest;
use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use App\Domains\Auth\Shared\Services\AuthService;
use App\Domains\Users\Http\Resources\UserResource;
use App\Domains\Users\Services\ProfileImageService;
use App\Support\PhoneRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

class AuthController
{
    private const REFRESH_COOKIE = 'refresh_token';

    private const COOKIE_PATH = '/api/auth';

    private const COOKIE_MINUTES = 60 * 24 * 30; // 30 días

    private const ACCESS_TTL = 900;

    /**
     * Cookie name + path for the access_token cookie that
     * `JwtAuthenticate` reads as a fallback on /api/notifications/stream
     * (where EventSource cannot send Authorization headers).
     *
     * Path scope matches the SSE endpoint prefix; the cookie is never
     * attached to /api/menus/my or any other unrelated request.
     */
    private const ACCESS_COOKIE = 'access_token';

    private const ACCESS_COOKIE_PATH = '/api/notifications';

    public function __construct(
        private readonly AuthService $authService,
        private readonly ProfileImageService $profileImageService,
    ) {}

    /**
     * POST /api/login
     */
    public function login(LoginRequest $request): JsonResponse
    {
        try {
            $result = $this->authService->login(
                email: $request->validated()['email'],
                password: $request->validated()['password'],
                ip: $request->ip(),
                ua: $request->userAgent(),
            );
        } catch (PendingInvitationException $e) {
            Log::warning('auth.local.pending_invitation', [
                'method' => __METHOD__,
                'email' => $request->validated()['email'],
                'ip' => $request->ip(),
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNAUTHORIZED);
        } catch (EmailNotVerifiedException $e) {
            // Story sc-117 — 403 estructurado con código
            // `email_not_verified` para que el frontend redirija a
            // la pantalla de verificación (POST /api/email/resend).
            // Reemplazamos el `getMessage()` del exception con la
            // traducción canónica del i18n (mensajes.email_not_verified)
            // para que la copia llegue al usuario en su idioma activo.
            Log::info('auth.local.email_not_verified', [
                'method' => __METHOD__,
                'email' => $request->validated()['email'],
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'message' => __('messages.email_not_verified'),
                'code' => 'email_not_verified',
            ], Response::HTTP_FORBIDDEN);
        } catch (AuthenticationException $e) {
            throw $e->toValidationException();
        }

        return response()->json([
            'access_token' => $result['accessToken'],
            'token_type' => 'Bearer',
            'expires_in' => self::ACCESS_TTL,
            'user' => new UserResource($result['user']),
        ])
            ->withCookie($this->refreshCookie($result['refreshToken']))
            ->withCookie($this->accessCookie($result['accessToken']));
    }

    /**
     * POST /api/auth/refresh
     */
    public function refresh(Request $request): JsonResponse
    {
        try {
            $result = $this->authService->refresh(
                refreshToken: $request->cookie(self::REFRESH_COOKIE) ?? '',
                ip: $request->ip(),
                ua: $request->userAgent(),
            );
        } catch (AuthenticationException $e) {
            Log::warning('auth.local.refresh_failed', [
                'method' => __METHOD__,
                'ip' => $request->ip(),
                'message' => $e->getMessage(),
            ]);

            return response()->json(
                $e->toResponse(),
                Response::HTTP_UNAUTHORIZED,
            );
        }

        return response()->json([
            'access_token' => $result['accessToken'],
            'token_type' => 'Bearer',
            'expires_in' => self::ACCESS_TTL,
        ])
            ->withCookie($this->refreshCookie($result['refreshToken']))
            ->withCookie($this->accessCookie($result['accessToken']));
    }

    /**
     * POST /api/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $sessionId = $request->input('_session_id');

        if ($sessionId !== null) {
            $this->authService->revokeSession($sessionId);
        }

        return response()->json([
            'message' => __('messages.session_closed'),
        ])
            ->withCookie($this->expiredCookie())
            ->withCookie($this->expiredAccessCookie());
    }

    /**
     * GET /api/me
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json(
            new UserResource($request->user()->load('role')),
        );
    }

    /**
     * PUT /api/auth/profile
     *
     * Dual-mode:
     * - JSON (application/json): accepts avatar as { urls: [...] } legacy object.
     * - Multipart (multipart/form-data): accepts avatar as an uploaded file.
     */
    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        if (array_key_exists('phone', $validated)) {
            $validated['phone'] = PhoneRules::normalize($validated['phone']);
        }

        // Handle password hashing (never mass-assign raw password)
        if (array_key_exists('password', $validated)) {
            if ($validated['password'] !== null && $validated['password'] !== '') {
                $validated['password'] = Hash::make($validated['password']);
            } else {
                unset($validated['password']);
            }
        }

        // Handle avatar file upload via ProfileImageService (writes to the
        // shared `images` table — `profile_image_path` column is dead,
        // WU8 drops it).
        if ($request->hasFile('avatar')) {
            $this->profileImageService->replaceAvatar($user, $request->file('avatar'));
            // Remove legacy avatar array from text update — file upload replaces it
            unset($validated['avatar']);
        }

        // Update text fields
        if ($validated !== []) {
            $user->update($validated);
        }

        return response()->json(
            new UserResource($user->load(['role', 'organization', 'avatarImage'])),
        );
    }

    /**
     * Build HttpOnly cookie with the refresh token.
     */
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

    /**
     * Build cookie that expires immediately (for logout).
     */
    private function expiredCookie(): Cookie
    {
        return cookie(
            self::REFRESH_COOKIE,
            '',
            -60,
            self::COOKIE_PATH,
            null,
            app()->isProduction(),
            true,
            false,
            'Strict',
        );
    }

    /**
     * Build HttpOnly cookie scoped to /api/notifications so native
     * EventSource on /api/notifications/stream can authenticate without
     * Authorization headers. Same Strict + production-only-secure posture
     * as refreshCookie.
     */
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

    /**
     * Expire the access_token cookie on logout.
     */
    private function expiredAccessCookie(): Cookie
    {
        return cookie(
            self::ACCESS_COOKIE,
            '',
            -60,
            self::ACCESS_COOKIE_PATH,
            null,
            app()->isProduction(),
            true,
            false,
            'Strict',
        );
    }
}
