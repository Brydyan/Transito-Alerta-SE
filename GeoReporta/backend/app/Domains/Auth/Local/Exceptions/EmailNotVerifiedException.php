<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Exceptions;

use Symfony\Component\HttpFoundation\Response;

/**
 * Lanzada cuando un usuario intenta hacer login pero su correo aún no fue
 * verificado (R8 del registro local — email_verified_at IS NULL).
 *
 * El login se rechaza con 403 Forbidden y un cuerpo JSON que incluye
 * `code: "email_not_verified"` para que el frontend distinga este caso
 * de un 401 (credenciales inválidas) y redirija al usuario a la pantalla
 * de verificación con opción de reenviar el correo.
 *
 * Decisión de producto (story sc-117): bloquear el inicio de sesión de
 * forma dura — no es un warning suave. Esto evita que un usuario con
 * un correo comprometido por otra persona acceda antes de probar
 *Ownership del correo.
 */
class EmailNotVerifiedException extends \RuntimeException
{
    public function __construct(
        string $message = 'Debes verificar tu correo electrónico antes de iniciar sesión.',
    ) {
        parent::__construct($message, Response::HTTP_FORBIDDEN);
    }
}
