<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Policies;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Shared\Http\Policies\PermissionPolicy;
use App\Domains\Users\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Database\Eloquent\Model;

class IncidentPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'incidents';
    }

    public function view(User $user, Model $model): bool
    {
        // Los ciudadanos con feed.detail pueden ver cualquier incidencia
        // desde el feed, sin pasar por el check de incidents.view (que es
        // el permiso administrativo de incidencias y gatilla el menú staff).
        if ($user->can('feed.detail')) {
            return true;
        }

        if (! parent::view($user, $model)) {
            return false;
        }

        if ($user->isSystemAdmin()) {
            return true;
        }

        return $model->organization_id !== null && $model->organization_id === $user->organization_id;
    }

    public function update(User $user, Model $model): bool
    {
        // System admins edit anything within their org scope (which is "all orgs").
        // Operators and admins-in-org only edit their own org's incidents.
        if ($user->isSystemAdmin()) {
            return true;
        }

        $inSameOrg = $model->organization_id !== null
            && $model->organization_id === $user->organization_id;

        return $inSameOrg && parent::update($user, $model);
    }

    public function delete(User $user, Model $model): bool
    {
        if (! parent::delete($user, $model)) {
            return false;
        }

        if ($user->isSystemAdmin()) {
            return true;
        }

        return $model->organization_id !== null && $model->organization_id === $user->organization_id;
    }

    /**
     * Claim una incidencia (asignarse como operador).
     *
     * Requiere incidents.update (admin_sistema via Gate::before,
     * admin_organización y operador_organización lo tienen) +
     * pertenecer a la misma organización. El service layer (IncidentClaimService)
     * valida las reglas de negocio: máx claims activos, no reclamar lo ya
     * asignado, etc.
     */
    public function claim(User $user, Incident $incident): bool
    {
        if (! $user->can('incidents.update')) {
            return false;
        }

        return $incident->organization_id === $user->organization_id;
    }

    /**
     * Release una incidencia previamente claimeada.
     *
     * Requiere incidents.update + ser el dueño del claim.
     * El service layer valida consistencia.
     */
    public function release(User $user, Incident $incident): bool
    {
        if (! $user->can('incidents.update')) {
            return false;
        }

        return $incident->claimed_by === $user->id;
    }

    /**
     * Cambiar el estado exige, además del permiso de update, estar asignado
     * como `responsable` de la incidencia — sin importar el rol. Un request
     * que repite el estado actual es un no-op y no exige responsable.
     *
     * Único dueño de la regla: la consumen IncidentController::updateStatus()
     * (vía authorize) y UpdateIncidentRequest::authorize() (vía Gate).
     */
    public function updateStatus(User $user, Incident $incident, string $newStatus): Response|bool
    {
        if (! $this->update($user, $incident)) {
            return false;
        }

        if ($newStatus === $incident->status->value) {
            return true;
        }

        $isResponsable = $incident->assignedUsers()
            ->where('user_id', $user->id)
            ->where('assignment_role', 'responsable')
            ->exists();

        return $isResponsable
            ? true
            : Response::deny('No estás asignado como responsable de esta incidencia.');
    }
}
