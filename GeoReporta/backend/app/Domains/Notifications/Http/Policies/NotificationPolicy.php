<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Http\Policies;

use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Users\Models\User;

/**
 * Las notificaciones son privadas: solo el dueño puede leerlas o marcarlas.
 *
 * Las acciones `viewAny` / `create` / `update` / `delete` del Resource se
 * deniegan por defecto (no hay gestión de notificaciones desde la API más
 * allá de las acciones del dueño). `markRead` se chequea por separado con
 * `markAsRead()`.
 *
 * Para `approve`/`reject` sobre IncidentPendingApproval, el policy evalúa
 * rol + scope de organización (admin_sistema global, admin_sistema org-scoped,
 * admin_organizacion org-scoped). Otros tipos delegan a `update()` (owner-only).
 */
class NotificationPolicy
{
    public function viewAny(User $user): bool
    {
        return false;
    }

    public function view(User $user, Notification $notification): bool
    {
        return $user->id === $notification->user_id;
    }

    public function create(User $user): bool
    {
        return false;
    }

    public function update(User $user, Notification $notification): bool
    {
        return $user->id === $notification->user_id;
    }

    public function delete(User $user, Notification $notification): bool
    {
        return $user->id === $notification->user_id;
    }

    /**
     * Acción específica de PATCH .../read — equivalente a update en este caso.
     */
    public function markAsRead(User $user, Notification $notification): bool
    {
        return $this->update($user, $notification);
    }

    /**
     * Aprueba una notificación de tipo IncidentPendingApproval.
     *
     * - admin_sistema global (organization_id=null): approve cualquier notificación.
     * - admin_sistema org-scoped: solo notificaciones de su organización.
     * - admin_organizacion: solo notificaciones de su organización.
     * - operador_x / usuario: nunca.
     * - Otros tipos de notificación: delegar a update().
     */
    public function approve(User $user, Notification $notification): bool
    {
        if (! $user->hasPermissionTo('notifications', 'update')) {
            return false;
        }

        if ($notification->type !== NotificationType::IncidentPendingApproval) {
            return $this->update($user, $notification);
        }

        if (! $notification->relationLoaded('incident')) {
            $notification->load('incident');
        }

        $incident = $notification->incident;

        // admin_sistema global — organization_id === null
        if ($user->isSystemAdmin() && $user->organization_id === null) {
            return true;
        }

        // admin_sistema org-scoped — puede approve solo incidentes de su org
        if ($user->isSystemAdmin() && $user->organization_id !== null) {
            return $incident !== null && $incident->organization_id === $user->organization_id;
        }

        // admin_organizacion — scope org
        if ($user->isOrganizationAdmin()) {
            return $incident !== null && $incident->organization_id === $user->organization_id;
        }

        return false;
    }

    /**
     * Rechaza una notificación de tipo IncidentPendingApproval.
     * Misma lógica que approve().
     */
    public function reject(User $user, Notification $notification): bool
    {
        return $this->approve($user, $notification);
    }
}
