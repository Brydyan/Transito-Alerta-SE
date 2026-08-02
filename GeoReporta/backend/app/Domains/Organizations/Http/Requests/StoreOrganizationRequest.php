<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http\Requests;

use App\Domains\Organizations\Models\Organization;
use Illuminate\Foundation\Http\FormRequest;

class StoreOrganizationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Organization::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'location_id' => 'required|integer|exists:locations,id',
            'parent_id' => 'nullable|integer|exists:organizations,id',
            'incident_category_id' => 'nullable|integer|exists:incident_categories,id',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'location_id.required' => 'La ubicación es obligatoria.',
            'location_id.exists' => 'La ubicación seleccionada no existe.',
            'parent_id.exists' => 'La organización padre seleccionada no existe.',
            'incident_category_id.exists' => 'La categoría seleccionada no existe.',
        ];
    }
}
