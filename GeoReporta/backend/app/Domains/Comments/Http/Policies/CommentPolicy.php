<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Policies;

use App\Domains\Comments\Models\Comment;
use App\Domains\Shared\Http\Policies\PermissionPolicy;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Authorization for Comments.
 *
 * `viewAny` and `create` come from {@see PermissionPolicy} and delegate to
 * the `comments.{view|create}` Gate dynamic — they have no model instance
 * to scope against (Laravel's authorizeResource never passes the parent
 * `Incident` to list/create-level checks), so `CommentController::index()`
 * and `::store()` additionally call `authorizeIncidentOrgScope()` directly
 * against the resolved `Incident` route param. This Policy only covers the
 * single-comment actions (`view`/`update`/`delete`), which DO get a model.
 *
 * `update` and `delete` follow the **owner-or-permission** rule from the
 * spec (R-17, R-18): the original author can always edit/delete their own
 * comment regardless of role/org — i.e. if you wrote it, you own it, and
 * org-scoping below never applies to the owner path. Non-owners need
 * `comments.update` / `comments.delete` AND must be in the same
 * organization as the comment's incident (system-wide roles and users with
 * no organization — citizens, operador_sistema — are exempt from the org
 * check and rely on the permission gate alone, matching how those roles
 * already work throughout this codebase).
 *
 * The parameter type is `Model` (not `Comment`) because PHP requires
 * overrides to match the parent's signature exactly — CommentPolicy extends
 * {@see PermissionPolicy}, whose `view`/`update`/`delete` declare
 * `Model $model`. We narrow inside the body.
 *
 * Org-scoping added after a review found admin_organizacion/
 * operador_organizacion (both hold comments.view/comments.update per
 * RolePermissionSeeder) could read and edit another organization's
 * comments — see docs/Pendientes/10-enforcement-permisos-frontend.md.
 */
class CommentPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'comments';
    }

    public function view(User $user, Model $comment): bool
    {
        if (! parent::view($user, $comment)) {
            return false;
        }

        return self::hasOrgAccess($user, self::incidentOrgId($comment));
    }

    public function update(User $user, Model $comment): bool
    {
        // Owner always wins (R-17) — org-scoping never applies here.
        if ((int) $comment->user_id === (int) $user->id) {
            return true;
        }

        if (! $user->can('comments.update')) {
            return false;
        }

        return self::hasOrgAccess($user, self::incidentOrgId($comment));
    }

    public function delete(User $user, Model $comment): bool
    {
        if ((int) $comment->user_id === (int) $user->id) {
            return true;
        }

        if (! $user->can('comments.delete')) {
            return false;
        }

        return self::hasOrgAccess($user, self::incidentOrgId($comment));
    }

    /**
     * Regla única de scope organizacional sobre comentarios, compartida con
     * CommentController::authorizeIncidentOrgScope() (index/store nunca
     * reciben la Incident vía authorizeResource, así que el controller la
     * aplica directo sobre el route param).
     *
     * System admins pasan siempre; users sin organización (citizens,
     * operador_sistema) no se org-scopean — los gobierna solo el gate de
     * permisos, como en el resto del codebase.
     */
    public static function hasOrgAccess(User $user, ?int $incidentOrgId): bool
    {
        if ($user->isSystemAdmin() || $user->organization_id === null) {
            return true;
        }

        return $incidentOrgId !== null && $incidentOrgId === $user->organization_id;
    }

    private static function incidentOrgId(Model $comment): ?int
    {
        /** @var Comment $comment */
        return $comment->incident?->organization_id;
    }
}
