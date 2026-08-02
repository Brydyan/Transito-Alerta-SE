<?php

declare(strict_types=1);

namespace App\Domains\Mail\Services;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;

/**
 * Contrato para envío de mail de notificación de asignación de operador
 * a una incidencia.
 *
 * Dedicated a mail EXCLUSIVAMENTE cuando un operador se asigna formalmente
 * a una incidencia (responsable o apoyo) vía el modelo Assignment. NO
 * cubre otros canales (Mercure/SSE ya está cubierto por NotificationService).
 *
 * La idea de exponer un método específico del dominio (`sendAssignedIncident`)
 * en lugar de uno genérico `send(Mailable)` es:
 *   1. Evita que el observer tenga que conocer el Mailable concreto.
 *   2. Hace explícito en el sitio de llamada que se trata de un evento
 *      "operador asignado a incidencia", no un mail genérico.
 *   3. Permite mockear con Mockery::mock(MailSenderInterface::class) en
 *      tests feature sin tener que importar la jerarquía de Mailables.
 *
 * La tolerancia a fallos (no propagar excepciones al SMTP) es
 * responsabilidad de la implementación, no del contrato — esto refleja
 * el patrón ya existente en AssignmentNotificationObserver y
 * NotificationService (S-7: un fallo de notificación nunca bloquea la
 * fila en la tabla de negocio).
 */
interface MailSenderInterface
{
    /**
     * Envía un mail al operador notificando que fue asignado a una
     * incidencia en el rol indicado.
     *
     * @param  User  $user  Operador asignado (destinatario).
     * @param  Incident  $incident  Incidencia a la que se asignó.
     * @param  string  $assignmentRole  Rol de la asignación
     *                                  ('responsable' | 'apoyo').
     */
    public function sendAssignedIncident(User $user, Incident $incident, string $assignmentRole): void;

    /**
     * Envía un mail de invitación al usuario recién creado.
     *
     * El mail contiene un link con el token en plaintext para que
     * el invitado acepte los Términos y Condiciones y setee su password.
     *
     * @param  User  $user  Usuario invitado (destinatario).
     * @param  string  $tokenPlain  Token de invitación en texto plano
     *                              (NUNCA guardar en la DB — solo en el mail).
     */
    public function sendUserInvitation(User $user, string $tokenPlain): void;
}
