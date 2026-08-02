<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Exceptions;

use Symfony\Component\HttpFoundation\Response;

class InvitationNotFoundException extends \RuntimeException
{
    public function __construct(
        string $message = 'Invitación no encontrada',
    ) {
        parent::__construct($message, Response::HTTP_NOT_FOUND);
    }
}
