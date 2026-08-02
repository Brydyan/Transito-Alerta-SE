<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Controllers;

use App\Domains\Auth\Local\Http\Requests\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;

class ResetPasswordController
{
    public function __invoke(ResetPasswordRequest $request): JsonResponse
    {
        $credentials = [
            'token' => $request->input('token'),
            'email' => strtolower(trim((string) $request->input('email'))),
            'password' => $request->input('password'),
            'password_confirmation' => $request->input('password_confirmation'),
        ];

        $status = Password::reset(
            $credentials,
            function ($user, $password) {
                $user->forceFill([
                    'password' => bcrypt($password),
                ])->save();
            },
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => __('messages.password_reset')]);
        }

        Log::warning('ResetPassword failed', [
            'email' => $credentials['email'],
            'status' => $status,
        ]);

        return response()->json([
            'message' => __('messages.password_reset_failed'),
        ], 400);
    }
}
