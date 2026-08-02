<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Services;

use App\Domains\Comments\Models\Comment;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Services\NotificationService;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Orquestra la transacción de decisión (approve/reject) sobre una notificación
 * de tipo IncidentPendingApproval.
 *
 * Detiene la puerta (gate) si la notificación ya fue procesada o si la
 * incidencia no está en estado Resolved. Dentro del DB::transaction aplica
 * lockForUpdate() sobre la notificación y la incidencia para prevenir
 * double-click concurrentes.
 *
 * @cqrs-role command-service
 */
final class IncidentApprovalService
{
    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    /**
     * Aprueba una incidencia: cierra la notificación y pasa la incidencia a Closed.
     *
     * @throws \RuntimeException 409 si la notificación ya fue procesada o
     *                           la incidencia no está en estado Resolved
     */
    public function approve(Notification $notification, User $actor): Incident
    {
        return DB::transaction(function () use ($notification, $actor): Incident {
            // Re-bloqueamos la fila para impedir race-condition con double-click.
            $notification = Notification::where('id', $notification->id)
                ->lockForUpdate()
                ->firstOrFail();

            $incident = Incident::where('id', $notification->incident_id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->guardApprove($notification, $incident);

            $incident->update([
                'status' => IncidentStatus::Closed,
                'approved_by' => $actor->id,
                'approved_at' => now(),
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_reason' => null,
            ]);

            $notification->update(['processed_at' => now(), 'read' => true]);

            // Marca todas las notificaciones hermanas (mismo incident_id + type)
            // como procesadas para que los demás admins no vean "pendiente"
            // lo que ya está decidido y fallen con 409 al intentar aprobar.
            Notification::where('incident_id', $incident->id)
                ->where('type', NotificationType::IncidentPendingApproval->value)
                ->where('id', '!=', $notification->id)
                ->whereNull('processed_at')
                ->update(['processed_at' => now(), 'read' => true]);

            // Notificar al ciudadano que su incidencia fue cerrada.
            $this->notifyCitizenClosed($incident);

            // Si había un operador que resolvió, notificarle que fue aprobado.
            if ($incident->claimed_by !== null) {
                $this->notifyClaimantApproved($incident, $actor);
            }

            return $incident->fresh();
        });
    }

    /**
     * Rechaza una incidencia: persiste reason en Comment, decide el siguiente
     * status según haya un claimant activo o no, y limpia los campos opuestos.
     *
     * @throws \RuntimeException 409 si la notificación ya fue procesada o
     *                           la incidencia no está en estado Resolved
     * @throws \RuntimeException 422 si el reason no cumple el length 10-500
     */
    public function reject(Notification $notification, User $actor, string $reason): Incident
    {
        // Defense-in-depth: la request ya valida, el service re-checkea.
        if (strlen($reason) < 10 || strlen($reason) > 500) {
            throw new \RuntimeException(
                'El motivo del rechazo debe tener entre 10 y 500 caracteres.',
                422,
            );
        }

        return DB::transaction(function () use ($notification, $actor, $reason): Incident {
            $notification = Notification::where('id', $notification->id)
                ->lockForUpdate()
                ->firstOrFail();

            $incident = Incident::where('id', $notification->incident_id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->guardDecidable($notification, $incident);

            // Determinar siguiente status según claimant activo.
            $nextStatus = IncidentStatus::Pending;
            $clearClaim = false;

            if ($incident->claimed_by !== null) {
                $claimant = User::find($incident->claimed_by);
                if ($claimant !== null && $claimant->deleted_at === null) {
                    $nextStatus = IncidentStatus::InProgress;
                } else {
                    $clearClaim = true;
                }
            }

            $incidentUpdate = [
                'status' => $nextStatus,
                'rejected_by' => $actor->id,
                'rejected_at' => now(),
                'rejection_reason' => $reason,
                'approved_by' => null,
                'approved_at' => null,
            ];

            if ($clearClaim) {
                $incidentUpdate['claimed_by'] = null;
                $incidentUpdate['claimed_at'] = null;
            }

            $incident->update($incidentUpdate);

            // Registrar el motivo como comentario de auditoría.
            Comment::create([
                'incident_id' => $incident->id,
                'user_id' => $actor->id,
                'message' => $reason,
            ]);

            $notification->update(['processed_at' => now(), 'read' => true]);

            // Marca todas las notificaciones hermanas (mismo incident_id + type)
            // como procesadas para que los demás admins no vean "pendiente"
            // lo que ya está decidido.
            Notification::where('incident_id', $incident->id)
                ->where('type', NotificationType::IncidentPendingApproval->value)
                ->where('id', '!=', $notification->id)
                ->whereNull('processed_at')
                ->update(['processed_at' => now(), 'read' => true]);

            // Notificar al claimant si sigue asignado.
            if ($incident->claimed_by !== null) {
                $this->notifyClaimantRejected($incident, $actor);
            }

            return $incident->fresh();
        });
    }

    /**
     * Devuelve los usuarios que deben recibir la notificación de approval pending.
     *
     * Incluye admin_sistema (global o de la org) y admin_organizacion de la org.
     * Excluye operador_* y usuario.
     *
     * @return array<int, User>
     */
    public function pendingApprovalRecipients(Incident $incident): array
    {
        $adminSistemaGlobal = User::query()
            ->whereHas('role', fn ($q) => $q->where('name', UserRole::AdminSistema->value))
            ->whereNull('organization_id')
            ->get();

        $adminSistemaOrg = User::query()
            ->whereHas('role', fn ($q) => $q->where('name', UserRole::AdminSistema->value))
            ->where('organization_id', $incident->organization_id)
            ->get();

        $adminOrg = User::query()
            ->whereHas('role', fn ($q) => $q->where('name', UserRole::AdminOrganizacion->value))
            ->where('organization_id', $incident->organization_id)
            ->get();

        $operadores = User::query()
            ->whereHas('role', fn ($q) => $q->whereIn('name', [
                UserRole::OperadorOrganizacion->value,
                UserRole::OperadorSistema->value,
                UserRole::Usuario->value,
            ]))
            ->pluck('id');

        $excludeIds = $operadores->flip()->toArray();

        return collect([...$adminSistemaGlobal, ...$adminSistemaOrg, ...$adminOrg])
            ->filter(fn ($user) => ! isset($excludeIds[$user->id]))
            ->values()
            ->all();
    }

    /**
     * Valida que la notificación sea de approval pending y que la incidencia
     * esté en estado Resolved. Usa esta guarda para reject() que debe poder
     * limpiar una aprobación previa.
     *
     * @throws \RuntimeException 409
     */
    private function guardDecidable(Notification $notification, Incident $incident): void
    {
        if (
            $notification->processed_at !== null
            || $notification->type !== NotificationType::IncidentPendingApproval
            || $incident->status !== IncidentStatus::Resolved
        ) {
            throw new \RuntimeException('No decidible', 409);
        }
    }

    /**
     * Valida que la notificación sea de approval pending y que la incidencia
     * esté en estado Resolved y no haya sido aprobada previamente.
     *
     * @throws \RuntimeException 409
     */
    private function guardApprove(Notification $notification, Incident $incident): void
    {
        if (
            $notification->processed_at !== null
            || $notification->type !== NotificationType::IncidentPendingApproval
            || $incident->status !== IncidentStatus::Resolved
            || $incident->approved_at !== null
        ) {
            throw new \RuntimeException('No decidible', 409);
        }
    }

    /**
     * Notifica al ciudadano que su incidencia fue cerrada.
     */
    private function notifyCitizenClosed(Incident $incident): void
    {
        $citizen = $incident->user;
        if ($citizen === null) {
            return;
        }

        $this->notifications->notify(
            $citizen,
            NotificationType::StatusChange,
            'Tu incidencia ha sido revisada y cerrada por un administrador.',
            $incident->id,
        );
    }

    /**
     * Notifica al operador/claimant que su resolución fue aprobada.
     */
    private function notifyClaimantApproved(Incident $incident, User $approver): void
    {
        $claimant = User::find($incident->claimed_by);
        if ($claimant === null) {
            return;
        }

        $this->notifications->notify(
            $claimant,
            NotificationType::StatusChange,
            'Tu resolución fue aprobada y la incidencia fue cerrada.',
            $incident->id,
        );
    }

    /**
     * Notifica al operador/claimant que su resolución fue rechazada.
     */
    private function notifyClaimantRejected(Incident $incident, User $rejector): void
    {
        $claimant = User::find($incident->claimed_by);
        if ($claimant === null) {
            return;
        }

        $this->notifications->notify(
            $claimant,
            NotificationType::StatusChange,
            'Tu resolución fue rechazada. La incidencia volvió a estado en proceso.',
            $incident->id,
        );
    }
}
