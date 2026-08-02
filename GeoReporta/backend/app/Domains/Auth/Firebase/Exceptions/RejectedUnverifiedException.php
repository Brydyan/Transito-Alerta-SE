<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Exceptions;

use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use Symfony\Component\HttpFoundation\Response;

final class RejectedUnverifiedException extends AuthenticationException
{
    public function __construct(
        string $message = 'Esta cuenta ya existe, iniciá sesión con tu contraseña',
    ) {
        parent::__construct($message, null, Response::HTTP_UNAUTHORIZED);
    }
}
