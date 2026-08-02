<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Exceptions;

use Symfony\Component\HttpFoundation\Response;

class InvitationGoneException extends \RuntimeException
{
    public function __construct(
        string $message = 'Invitación expirada o ya utilizada',
    ) {
        parent::__construct($message, Response::HTTP_GONE);
    }
}
