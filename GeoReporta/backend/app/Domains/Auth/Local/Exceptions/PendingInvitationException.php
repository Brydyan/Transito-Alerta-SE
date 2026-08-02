<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Exceptions;

use Symfony\Component\HttpFoundation\Response;

/**
 * Lanzada cuando un usuario con password=null intenta hacer login.
 *
 * El usuario fue creado por admin pero aún no aceptó la invitación.
 * Se usa en AuthService::login() (WU-3) — esta clase se crea en WU-2
 * para tenerla disponible, pero NO se usa hasta WU-3.
 */
class PendingInvitationException extends \RuntimeException
{
    public function __construct(
        string $message = 'Cuenta pendiente de activación. Revisá tu mail para completar el registro.',
    ) {
        parent::__construct($message, Response::HTTP_UNAUTHORIZED);
    }
}
