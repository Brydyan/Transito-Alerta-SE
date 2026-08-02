<?php

declare(strict_types=1);

namespace App\Domains\Auth\Shared\Exceptions;

use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class AuthenticationException extends \RuntimeException
{
    private ?string $field = null;

    public function __construct(
        string $message,
        ?string $field = null,
        int $code = Response::HTTP_UNAUTHORIZED,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $code, $previous);
        $this->field = $field;
    }

    /**
     * Convert to Laravel validation exception for field-specific errors.
     */
    public function toValidationException(): ValidationException
    {
        if ($this->field !== null) {
            return ValidationException::withMessages([
                $this->field => [$this->message],
            ]);
        }

        return ValidationException::withMessages([
            'error' => [$this->message],
        ]);
    }

    /**
     * Generate a simple JSON response for non-validation errors.
     *
     * @return array{message: string}
     */
    public function toResponse(): array
    {
        return ['message' => $this->message];
    }
}
