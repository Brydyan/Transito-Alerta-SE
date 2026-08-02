<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Observers;

use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Mail\Services\MailJobDispatcher;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Services\NotificationService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * Crea notificaciones cuando se asigna formalmente un operador a una
 * incidencia (responsable o apoyo) vía el modelo Assignment.
 *
 * Diferencia con IncidentNotificationObserver (que cubre claim/release/
 * confirm):
 *   - IncidentNotificationObserver escucha cambios en el modelo Incident
 *     (columna claimed_by) y notifica al dueño de la incidencia.
 *   - Este observer escucha la creación de filas en `assignments` y
 *     notifica al OPERADOR que fue asignado (in-app + Mercure + email).
 *
 * Eventos cubiertos:
 *   - created (Assignment $a)  → notifica al operador asignado con type
 *     NotificationType::Assigned, mensaje según assignment_role, y
 *     dispara un mail vía MailSenderInterface dedicado.
 *
 * Garantías:
 *   - Idempotencia S-3: si la asignación es al mismo operador que ya tiene
 *     el claim activo en la misma incidencia y el rol es responsable, no
 *     se crea notification adicional (admin formalizando lo que el
 *     operador ya se auto-asignó). El mail también se omite en este caso.
 *   - Tolerancia S-7: cualquier excepción se loguea vía Log::warning y
 *     NO se propaga. La creación de la fila en `assignments` es lo
 *     importante para el negocio; la notification (in-app + Mercure +
 *     email) es side-effect. MailJobDispatcher encola el Job de mail,
 *     y `SendAssignmentMailJob::handle()` + `MailSenderInterface`
 *     (SmtpMailSender) absorben fallos SMTP internamente (mismo patrón),
 *     pero el try/catch de este observer es un safety net final por si
 *     un mock o un remplazo futuro no honra el contrato.
 *   - La deduplicación 60s dentro de NotificationService::notify cubre
 *     ataques de doble-clic y reintentos del cliente.
 *   - Mail dedup: `SendAssignmentMailJob` implementa `ShouldBeUnique`
 *     con `uniqueId = sha1(assignment:incident_id:user_id)` y
 *     `uniqueFor = 300s`. Esto evita que dos reasignaciones rápidas
 *     al mismo operador (mismo incident + mismo user) encolen dos
 *     mails duplicados dentro de la ventana de retries.
 */
class AssignmentNotificationObserver
{
    public function __construct(
        private readonly NotificationService $service,
        private readonly MailJobDispatcher $mailDispatcher,
    ) {}

    public function created(Assignment $a): void
    {
        try {
            $this->handleCreated($a);
        } catch (\Throwable $e) {
            // No queremos que un fallo de notificaciones aborte el flujo
            // principal de asignación. La fila en `assignments` ya está
            // persistida; el operador puede ver su asignación al refrescar
            // el panel aunque no llegue el push en tiempo real.
            Log::warning('AssignmentNotificationObserver failed', [
                'assignment_id' => $a->id,
                'incident_id' => $a->incident_id,
                'user_id' => $a->user_id,
                'role' => $a->assignment_role,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function handleCreated(Assignment $a): void
    {
        $a->loadMissing(['user', 'incident']);

        // Defensive: si algún FK quedó null (cascada rara), no intentar
        // notificar a un destinatario inválido.
        if ($a->user === null || $a->incident === null) {
            return;
        }

        // Idempotencia S-3: si el operador ya tiene el claim activo en
        // la misma incidencia y se le está formalizando como responsable,
        // saltamos. El NotificationService también deduplica 60s pero esta
        // regla de negocio es más explícita en el observer.
        if (
            $a->assignment_role === AssignmentRole::Responsable->value
            && $a->incident->claimed_by !== null
            && (int) $a->incident->claimed_by === (int) $a->user_id
        ) {
            return;
        }

        $role = $a->assignment_role;
        $title = (string) $a->incident->title;

        $message = match ($role) {
            AssignmentRole::Responsable->value => "Se te asignó como responsable de la incidencia '{$title}'.",
            AssignmentRole::Apoyo->value => "Se te asignó como apoyo en la incidencia '{$title}'.",
            default => null,
        };

        // Rol desconocido (forward-compat con un futuro tercer case del
        // enum AssignmentRole): no es un error, simplemente no notificamos
        // aún. Logueamos a nivel info para trazabilidad.
        if ($message === null) {
            Log::info('AssignmentNotificationObserver: rol no reconocido, no se notifica', [
                'assignment_id' => $a->id,
                'role' => $role,
            ]);

            return;
        }

        $this->service->notify(
            user: $a->user,
            type: NotificationType::Assigned,
            message: $message,
            incidentId: (int) $a->incident->id,
            data: [
                'assignment_role' => $role,
                'actor_user_id' => Auth::id(),
                'incident_id' => (int) $a->incident->id,
                'incident_title' => $title,
            ],
        );

        // Side-effect: encolar mail al operador. El dispatcher delega
        // en `SendAssignmentMailJob` (ShouldQueue + ShouldBeUnique)
        // que el worker procesa fuera del request HTTP. La tolerancia
        // S-7 sigue activa porque el Job, al ejecutarse, llama a
        // `SmtpMailSender::sendAssignedIncident()` que absorbe
        // excepciones SMTP internamente. El try/catch exterior en
        // `created()` es un safety net final por si la cola está
        // caída y `dispatch()` falla (ej. Redis no responde).
        $this->mailDispatcher->dispatchAssignmentMail($a->user, $a->incident, $role);
    }
}
