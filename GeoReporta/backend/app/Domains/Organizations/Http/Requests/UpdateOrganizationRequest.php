<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http\Requests;

use App\Domains\Organizations\Models\Organization;
use Illuminate\Foundation\Http\FormRequest;

class UpdateOrganizationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $organization = Organization::find($this->route('organization'));
        if ($organization === null) {
            return false;
        }

        return $this->user()?->can('update', $organization) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:100',
            'location_id' => 'sometimes|integer|exists:locations,id',
            'parent_id' => 'nullable|integer|exists:organizations,id',
            'incident_category_id' => 'nullable|integer|exists:incident_categories,id',
        ];
    }

    public function messages(): array
    {
        return [
            'location_id.exists' => 'La ubicación seleccionada no existe.',
            'parent_id.exists' => 'La organización padre seleccionada no existe.',
            'incident_category_id.exists' => 'La categoría seleccionada no existe.',
        ];
    }
}
