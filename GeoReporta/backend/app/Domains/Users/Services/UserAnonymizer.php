<?php

declare(strict_types=1);

namespace App\Domains\Users\Services;

use App\Domains\Users\Models\User;

/**
 * Privacy-preserving projection of a User for inclusion in payloads that
 * may be served to viewers who don't actually need the report's identity.
 *
 * Issue #234 — Role-based anonymization for citizens viewing other users'
 * data. Citizen viewers (role `usuario`) should NOT see the report's first
 * name, last name, email, phone or avatar. Operators (`operador_*`,
 * `admin_*`) keep their current behavior — they need the real identity
 * for coordination, de-duplication, and audit.
 *
 * Output shape:
 *  - **Non-anonymous** (viewer is operator/admin, OR is the subject themselves):
 *    the project's standard user projection (id, names, email, phone, avatar
 *    keys) plus a `is_anonymous: false` flag so the frontend can route on it.
 *  - **Anonymous** (regular viewer, not the subject): only the `id` and a
 *    `is_anonymous: true` flag. The frontend renders a chosen placeholder
 *    ("Anónimo" in lists, "A.L. #142" in detail) — the ID is preserved so
 *    the admin can still cross-reference reports in the audit log.
 *
 * The subject's full record is never deleted from the DB — only the
 * fields exposed to anonymous viewers are suppressed. Operators and
 * admins continue to see the same fields they always have.
 */
class UserAnonymizer
{
    /**
     * Project the user payload for the given viewer.
     *
     * @param  User|null  $subject  the user being serialized (the reporter,
     *                              an assignee, a comment author, etc.)
     * @param  User|null  $viewer  the authenticated requester
     * @return array<string, mixed> the safe payload to embed in the
     *                              response. Empty array when $subject is null.
     */
    public function anonymize(?User $subject, ?User $viewer): array
    {
        if ($subject === null) {
            return [];
        }

        // The viewer themselves always sees their own data, even when
        // they're a citizen — they need to recognise their own reports.
        if ($viewer !== null && $viewer->id === $subject->id) {
            return $this->asArray($subject, isAnonymous: false);
        }

        // Operators and admins (anyone who isn't isRegularUser) keep
        // their current visibility — coordination / audit needs the
        // real identity.
        if ($viewer !== null && ! $viewer->isRegularUser()) {
            return $this->asArray($subject, isAnonymous: false);
        }

        // Anyone else (regular user, unauthenticated) sees only the id
        // and the flag — the frontend decides the placeholder copy.
        return $this->asArray($subject, isAnonymous: true);
    }

    /**
     * @return array<string, mixed>
     */
    private function asArray(User $subject, bool $isAnonymous): array
    {
        if ($isAnonymous) {
            return [
                'id' => $subject->id,
                'is_anonymous' => true,
                'first_name' => null,
                'last_name' => null,
                'email' => null,
                'phone' => null,
                'avatar' => null,
                'profile_image_path' => null,
            ];
        }

        return [
            'id' => $subject->id,
            'is_anonymous' => false,
            'first_name' => $subject->first_name,
            'last_name' => $subject->last_name,
            'email' => $subject->email,
            'phone' => $subject->phone,
            'avatar' => $subject->avatar,
            'profile_image_path' => $subject->avatarImage?->storage_path,
        ];
    }
}
