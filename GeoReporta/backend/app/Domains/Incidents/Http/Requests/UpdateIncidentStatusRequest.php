<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Requests;

use App\Domains\Incidents\Models\Incident;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateIncidentStatusRequest extends FormRequest
{
    /**
     * Authorization (permiso de update + regla de responsable) corre en
     * IncidentPolicy::updateStatus desde el controller, que necesita el
     * status ya validado.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // `closed` is permitted here so the controller's explicit guard
            // (see IncidentController::updateStatus) can produce the
            // dedicated "flow required" message. The request validation is
            // intentionally permissive — the controller is the single source
            // of truth for the closed-status rejection reason.
            'status' => ['required', Rule::in([Incident::STATUS_PENDING, Incident::STATUS_IN_PROGRESS, Incident::STATUS_RESOLVED, 'closed'])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'status.in' => 'El estado debe ser: pending, in_progress, resolved o closed.',
        ];
    }
}
