<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Requests;

use App\Domains\Incidents\Enums\AssignmentRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validation for PUT /api/incidents/{incident}/assignments/{assignment}.
 *
 * Inputs:
 *   - role: enum-backed string, one of AssignmentRole::values()
 *
 * Only the role can be updated — user_id is immutable. Authorization
 * follows the same pattern as StoreAssignmentRequest.
 */
class UpdateAssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in(AssignmentRole::values())],
        ];
    }

    public function messages(): array
    {
        return [
            'role.required' => 'El rol de asignación es obligatorio.',
            'role.in' => 'El rol debe ser responsable o apoyo.',
        ];
    }
}
