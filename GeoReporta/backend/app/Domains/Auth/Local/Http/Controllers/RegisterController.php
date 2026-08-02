<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Controllers;

use App\Domains\Auth\Local\Http\Requests\RegisterRequest;
use App\Domains\Auth\Local\Services\RegisterService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class RegisterController
{
    public function __construct(
        private readonly RegisterService $registerService,
    ) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = $this->registerService->register($request->validated());

        return response()->json(
            [
                'message' => 'Usuario creado correctamente',
                'requires_verification' => true,
                'email' => $user->email,
            ],
            Response::HTTP_CREATED,
        );
    }
}
