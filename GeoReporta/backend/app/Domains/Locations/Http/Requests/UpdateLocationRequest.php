<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http\Requests;

use App\Domains\Locations\Models\Location;
use Illuminate\Foundation\Http\FormRequest;

class UpdateLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $location = Location::find($this->route('location'));
        if ($location === null) {
            return false;
        }

        return $this->user()?->can('update', $location) ?? false;
    }

    public function rules(): array
    {
        $id = $this->route('location');

        return [
            'name' => 'sometimes|string|max:50',
            'code' => "sometimes|string|max:20|unique:locations,code,{$id}",
            'level' => 'sometimes|string|in:country,province,city,neighborhood',
            'parent_id' => 'nullable|integer|exists:locations,id',
            'geom' => 'nullable|json',
        ];
    }

    public function messages(): array
    {
        return [
            'code.unique' => 'Este código ya está en uso.',
            'level.in' => 'El nivel debe ser: country, province, city o neighborhood.',
            'parent_id.exists' => 'La ubicación padre seleccionada no existe.',
            'geom.json' => 'La geometría debe ser un JSON válido.',
        ];
    }
}
