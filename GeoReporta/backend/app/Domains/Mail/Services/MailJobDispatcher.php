<?php

declare(strict_types=1);

namespace App\Domains\Mail\Services;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Mail\Jobs\SendAssignmentMailJob;
use App\Domains\Mail\Jobs\SendInvitationMailJob;
use App\Domains\Users\Models\User;

/**
 * Dispatcher singleton que centraliza el "puente" entre el código de
 * dominio (observers, services) y los Jobs que se encolan para envío
 * asíncrono de mail.
 *
 * ## Por qué existe este servicio
 *
 * Antes de este cambio, el flujo era:
 *
 *   observer / service → MailSenderInterface (SmtpMailSender) → SMTP inline
 *
 * Eso bloqueaba el request HTTP en el round-trip SMTP. Para sacar la
 * latencia del camino crítico se introduce la indirección:
 *
 *   observer / service → MailJobDispatcher → dispatch() → Redis queue
 *      ↓
 *   worker process → Job::handle() → MailSenderInterface → SMTP
 *
 * El observer ya no debe conocer el nombre del Job, la queue, ni el
 * `uniqueId`. Esa política vive acá y se puede ajustar sin tocar a los
 * callers.
 *
 * ## Por qué es singleton
 *
 * El servicio NO encapsula estado mutable — el constructor está vacío
 * y cada método `dispatch*` instancia el Job en el momento. Lo
 * registramos como singleton en el container para:
 *
 *   1. Compartir la misma instancia a través de los múltiples
 *      observers/services que lo inyectan (evita re-resolución
 *      repetida bajo carga).
 *   2. Permitir un futuro override en tests con `$this->instance(...)`
 *      sin tener que re-bind por interface (no exponemos interface a
 *      propósito — es una decisión interna del dominio Mail).
 *
 * Esto NO es el antipatrón "singleton aplicado al Job": los Jobs son
 * construidos nuevos en cada `dispatch*Mail()` y Laravel los serializa
 * a Redis. El singleton acá es solo el dispatcher, no los Jobs.
 *
 * ## Tests / Mocking
 *
 * Los tests existentes mockean `MailSenderInterface` y siguen
 * funcionando porque el Job encolado termina resolviendo el container
 * en `handle()`. Si en el futuro se quiere mockear directamente el
 * dispatcher (ej. para verificar que NO se encola en cierto flujo),
 * se puede hacer con `Queue::fake()` o reemplazando el binding del
 * singleton en el container.
 */
class MailJobDispatcher
{
    public function __construct() {}

    /**
     * Encola el envío del mail de notificación por asignación de
     * operador. Acepta un parámetro opcional de queue para escenarios
     * donde se quiera segregar (ej. `mail-assignments` vs
     * `mail-invitations` con distinto worker / prioridad).
     *
     * Si no se pasa `$queue`, el Job cae en la queue default de
     * `config('queue.connections.redis.queue')`.
     */
    public function dispatchAssignmentMail(
        User $user,
        Incident $incident,
        string $assignmentRole,
        ?string $queue = null,
    ): void {
        $job = new SendAssignmentMailJob($user, $incident, $assignmentRole);

        if ($queue !== null) {
            $job->onQueue($queue);
        }

        dispatch($job);
    }

    /**
     * Encola el envío del mail de invitación. Misma lógica que
     * `dispatchAssignmentMail` respecto al parámetro `$queue` opcional.
     */
    public function dispatchInvitationMail(
        User $user,
        string $tokenPlain,
        ?string $queue = null,
    ): void {
        $job = new SendInvitationMailJob($user, $tokenPlain);

        if ($queue !== null) {
            $job->onQueue($queue);
        }

        dispatch($job);
    }
}
