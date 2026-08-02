<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Requests;

use App\Domains\Incidents\Enums\AssignmentRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validation for POST /api/incidents/{incident}/assignments.
 *
 * Inputs:
 *   - user_id: integer FK to users (the operator being assigned)
 *   - role:    enum-backed string, one of AssignmentRole::values()
 *
 * Authorization chain (mirrors CommentController / StoreIncidentRequest):
 *   - This FormRequest only checks `auth()->check()` — it must NOT
 *     duplicate the controller's `authorizeResource` policy check,
 *     which would cause a double-fire on the same gate.
 *   - The actual `assignments.create` permission gate (and the
 *     org-scope guard for AdminOrganizacion) is enforced at the
 *     controller via $this->authorize('create', Assignment::class)
 *     and authorizeIncidentOrgScope() respectively — see
 *     AssignmentController::store.
 *
 * The `role` rule uses `Rule::in(AssignmentRole::values())` rather than
 * a hard-coded list so that adding a new enum case automatically lands
 * a valid input value without touching this file.
 */
class StoreAssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role' => ['required', 'string', Rule::in(AssignmentRole::values())],
        ];
    }

    public function messages(): array
    {
        return [
            'user_id.required' => 'El operador a asignar es obligatorio.',
            'user_id.integer' => 'El operador seleccionado no es válido.',
            'user_id.exists' => 'El operador seleccionado no existe.',
            'role.required' => 'El rol de asignación es obligatorio.',
            'role.in' => 'El rol debe ser responsable o apoyo.',
        ];
    }
}
