<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Exceptions;

use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use Symfony\Component\HttpFoundation\Response;

final class InvalidFirebaseTokenException extends AuthenticationException
{
    public function __construct(string $message = 'Token de Google inválido')
    {
        parent::__construct($message, null, Response::HTTP_UNAUTHORIZED);
    }
}
