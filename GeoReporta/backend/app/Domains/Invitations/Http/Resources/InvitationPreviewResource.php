<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Http\Resources;

use App\Domains\Invitations\Models\UserInvitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Read-only payload returned by `GET /api/invitations/{token}/preview`.
 *
 * This resource is the single source of truth for what the preview
 * endpoint exposes: by design, NO PII (email, phone, internal IDs,
 * token material) leaves this layer. The controller maps the status
 * field to the response envelope and never reaches past this class to
 * assemble fields, so an accidental new field on UserInvitation cannot
 * leak by accident.
 *
 * Status values:
 *   - 'pending'  — accepted_at IS NULL AND expires_at > now
 *   - 'expired'  — expires_at < now AND accepted_at IS NULL
 *   - 'consumed' — accepted_at IS NOT NULL
 */
class InvitationPreviewResource extends JsonResource
{
    /**
     * @param  UserInvitation  $resource  the invitation whose metadata to expose
     * @param  string  $status  'pending'|'expired'|'consumed' — computed by the caller
     */
    public function __construct(
        UserInvitation $resource,
        public readonly string $status,
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var UserInvitation $invitation */
        $invitation = $this->resource;

        $inviter = $invitation->invitedByUser;
        $organization = $invitation->user?->organization;

        return [
            'status' => $this->status,
            'organization' => [
                'name' => $organization?->name,
                'initials' => self::computeInitials($organization?->name),
            ],
            'invitedBy' => $inviter === null ? null : [
                'name' => self::fullName($inviter->first_name, $inviter->last_name),
                'role' => $inviter->role?->name,
            ],
            'role' => $invitation->user?->role?->name,
            'issuedAt' => $invitation->created_at?->toIso8601String(),
            'expiresAt' => $invitation->expires_at->toIso8601String(),
            'termsVersion' => $invitation->terms_version,
        ];
    }

    /**
     * First letter of up to the first two whitespace-separated words,
     * uppercased. Returns '?' for null/empty input — the frontend uses
     * this for an initials avatar fallback when no logo is available.
     */
    private static function computeInitials(?string $name): string
    {
        if ($name === null) {
            return '?';
        }
        $trimmed = trim($name);
        if ($trimmed === '') {
            return '?';
        }

        $words = preg_split('/\s+/', $trimmed) ?: [];
        $initials = '';
        foreach (array_slice($words, 0, 2) as $word) {
            $initials .= mb_strtoupper(mb_substr($word, 0, 1));
        }

        return $initials;
    }

    /**
     * Concatenate first + last name with a single space, ignoring nulls
     * so an inviter with only `first_name` set still renders cleanly.
     */
    private static function fullName(?string $first, ?string $last): string
    {
        return trim(($first ?? '').' '.($last ?? ''));
    }
}
