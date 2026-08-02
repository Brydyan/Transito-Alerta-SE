<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Controllers;

use App\Domains\Auth\Local\Http\Requests\ForgotPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;

class ForgotPasswordController
{
    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        try {
            $email = strtolower(trim((string) $request->input('email')));

            $status = Password::sendResetLink(['email' => $email]);

            if ($status === Password::RESET_LINK_SENT || $status === Password::INVALID_USER) {
                return response()->json(['message' => __('messages.reset_link_sent')]);
            }

            Log::warning('ForgotPassword failed', [
                'email' => $email,
                'status' => $status,
            ]);

            if ($status === Password::RESET_THROTTLED) {
                return response()->json([
                    'message' => 'Has realizado demasiadas solicitudes. Por favor espera un minuto antes de reintentar.',
                ], 429);
            }

            return response()->json([
                'message' => __('messages.reset_link_failed'),
            ], 400);
        } catch (\Throwable $e) {
            Log::error('ForgotPassword error sending mail: '.$e->getMessage(), [
                'email' => $request->input('email'),
                'exception' => $e,
            ]);

            return response()->json([
                'message' => __('messages.reset_link_failed'),
            ], 400);
        }
    }
}
