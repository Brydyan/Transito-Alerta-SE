<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Http\Resources;

use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Users\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->data ?? [];

        // Para incident_pending_approval, enriquecer con datos del incident
        // cuando está cargado (permite al frontend mostrar contexto de aprobación).
        if ($this->type === NotificationType::IncidentPendingApproval
            && $this->relationLoaded('incident')
            && $this->incident
        ) {
            $data = array_merge($data, [
                'incident_id' => $this->incident->id,
                'incident_title' => $this->incident->title,
                'incident_status' => $this->incident->status->value,
                'organization_id' => $this->incident->organization_id,
                'responsible_user_id' => $this->incident->claimed_by,
                'responsible_user_name' => $this->incident->claimed_by
                    ? User::find($this->incident->claimed_by)?->name
                    : null,
                'approved_by' => $this->incident->approved_by,
                'approved_at' => $this->incident->approved_at?->toIso8601String(),
                'rejected_by' => $this->incident->rejected_by,
                'rejected_at' => $this->incident->rejected_at?->toIso8601String(),
                'rejection_reason' => $this->incident->rejection_reason,
            ]);
        }

        return [
            'id' => $this->id,
            'type' => $this->type?->value,
            'message' => $this->message,
            'data' => $data,
            'read' => (bool) $this->read,
            'processed_at' => $this->processed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'incident' => $this->whenLoaded('incident', fn () => $this->incident ? [
                'id' => $this->incident->id,
                'title' => $this->incident->title,
            ] : null),
        ];
    }
}
