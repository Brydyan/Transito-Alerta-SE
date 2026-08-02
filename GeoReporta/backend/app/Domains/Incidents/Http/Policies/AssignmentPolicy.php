<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Policies;

use App\Domains\Shared\Http\Policies\PermissionPolicy;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Authorization for the `assignments` sub-resource.
 *
 * Inherits the `create` / `view` / `delete` checks from
 * {@see PermissionPolicy}, which delegate to the canonical
 * `assignments.{create|view|delete}` Gate dynamic. The role-permission
 * grants live in `RolePermissionSeeder::assignPermissions` (PR #2
 * tasks 2.4 + 2.5): only `admin_sistema` (id 1) and
 * `admin_organizacion` (id 3) receive `create` + `delete`;
 * `assignments.view` is granted to all five roles.
 *
 * Why `viewAny` is overridden:
 *
 *   Task 2.1 of `historial-asignacion-operadores` explicitly delegates
 *   `viewAny` to the *parent resource's* permission — `incidents.view`
 *   — rather than the default `assignments.view`. The reasoning is
 *   that listing assignments of an incident is conceptually viewing
 *   that incident's full picture; admins who can see the incident
 *   should be able to enumerate its assignments without an extra
 *   permission grant. Users with `assignments.view` only (no
 *   `incidents.view`) cannot list — they MAY still load individual
 *   rows through `view(model)` if a future detail route is added.
 *
 * Org-scoping for `AdminOrganizacion`:
 *
 *   `create()` and `view()` are called by Laravel's Gate without a
 *   parent `Incident` instance (no model at list/create-time), so the
 *   policy can't org-scope them here. The controller mirrors
 *   `CommentController::authorizeIncidentOrgScope` and enforces the
 *   same-org rule explicitly. System admins bypass the org check via
 *   the global `Gate::before` registered in `AppServiceProvider`
 *   (covers all gates, including custom ones).
 */
class AssignmentPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'assignments';
    }

    /**
     * Index/listing gate. Delegates to `incidents.view` rather than
     * the default `assignments.view`; see class docblock for the
     * rationale. System admins still bypass via the global
     * `Gate::before` registered in `AppServiceProvider`.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('incidents.view');
    }

    /**
     * Permitted if the user holds `assignments.create`. Org-scoping
     * happens in the controller (no parent Incident is passed to Gate
     * at create-time).
     */
    public function create(User $user): bool
    {
        return parent::create($user);
    }

    /**
     * Permitted if the user holds `assignments.view`. Per-model
     * org-scoping is currently out of scope (no GET /assignments/{id}
     * detail route exists yet); when such a route is added it must
     * mirror the controller-side `authorizeIncidentOrgScope` pattern.
     */
    public function view(User $user, Model $model): bool
    {
        return parent::view($user, $model);
    }

    /**
     * Permitted if the user holds `assignments.update`. Org-scoping
     * is enforced at the controller layer (the parent `Incident` is
     * already resolved by the time `authorizeResource` calls this).
     */
    public function update(User $user, Model $model): bool
    {
        return parent::update($user, $model);
    }

    /**
     * Permitted if the user holds `assignments.delete`. Org-scoping
     * is enforced at the controller layer (the parent `Incident` is
     * already resolved by the time `authorizeResource` calls this).
     */
    public function delete(User $user, Model $model): bool
    {
        return parent::delete($user, $model);
    }
}
