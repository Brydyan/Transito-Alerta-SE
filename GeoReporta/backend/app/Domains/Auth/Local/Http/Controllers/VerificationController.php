<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Controllers;

use App\Domains\Users\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verificación de correo electrónico mediante código OTP — story sc-117.
 *
 * Endpoints:
 *   POST /api/email/verify-otp  (verifyOtp — pública, rate-limited)
 *   POST /api/email/resend      (resend    — pública/autenticada, rate-limited)
 *   GET  /api/email/notice      (notice    — autenticada)
 */
class VerificationController
{
    /**
     * POST /api/email/verify-otp
     *
     * Permite verificar el correo ingresando un código OTP de 6 dígitos.
     */
    public function verifyOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
            'otp' => ['required', 'string', 'size:6'],
        ]);

        /** @var User|null $user */
        $user = User::where('email', strtolower($validated['email']))->first();

        if ($user === null) {
            return $this->verificationFailed('user_not_found', __('messages.verification_otp_user_not_found'));
        }

        if ($user->hasVerifiedEmail()) {
            return $this->verificationSucceeded($user);
        }

        if (! $user->verifyOtp($validated['otp'])) {
            return response()->json([
                'message' => __('messages.verification_otp_invalid'),
                'code' => 'otp_invalid',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        Log::info('auth.email_verified_otp', [
            'user_id' => $user->id,
            'email_hash' => hash('sha256', (string) $user->email),
        ]);

        return $this->verificationSucceeded($user);
    }

    /**
     * POST /api/email/resend
     */
    public function resend(Request $request): JsonResponse
    {
        $email = $request->input('email');
        /** @var User|null $user */
        $user = $request->user() ?? ($email ? User::where('email', strtolower((string) $email))->first() : null);

        if ($user === null) {
            return response()->json([
                'message' => __('messages.verification_sent'),
            ], Response::HTTP_ACCEPTED);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json([
                'message' => __('messages.email_already_verified'),
            ], Response::HTTP_OK);
        }

        $user->sendEmailVerificationNotification();

        return response()->json([
            'message' => __('messages.verification_sent'),
        ], Response::HTTP_ACCEPTED);
    }

    /**
     * GET /api/email/notice
     *
     * Reporta el estado de verificación del usuario autenticado.
     */
    public function notice(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();

        if ($user === null) {
            return response()->json([
                'message' => __('messages.unauthenticated'),
            ], Response::HTTP_UNAUTHORIZED);
        }

        return response()->json([
            'verified' => $user->hasVerifiedEmail(),
            'verified_at' => optional($user->email_verified_at)->toIso8601String(),
        ]);
    }

    private function verificationSucceeded(User $user): JsonResponse
    {
        return response()->json([
            'message' => __('messages.verification_success'),
            'verified' => true,
            'user_id' => (int) $user->id,
        ]);
    }

    private function verificationFailed(string $code, string $message): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
        ], Response::HTTP_FORBIDDEN);
    }
}
