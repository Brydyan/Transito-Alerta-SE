<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http\Requests;

use App\Domains\Locations\Models\Location;
use Illuminate\Foundation\Http\FormRequest;

class StoreLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Location::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:50',
            'code' => 'required|string|max:20|unique:locations,code',
            'level' => 'required|string|in:country,province,city,neighborhood',
            'parent_id' => 'nullable|integer|exists:locations,id',
            'geom' => 'nullable|json',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'code.required' => 'El código es obligatorio.',
            'code.unique' => 'Este código ya está en uso.',
            'level.in' => 'El nivel debe ser: country, province, city o neighborhood.',
            'parent_id.exists' => 'La ubicación padre seleccionada no existe.',
            'geom.json' => 'La geometría debe ser un JSON válido.',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $level = $this->input('level');
            $parentId = $this->input('parent_id');

            if ($level === 'country' && ! empty($parentId)) {
                $validator->errors()->add('parent_id', 'Un país no puede tener una ubicación padre.');

                return;
            }

            if ($level !== 'country' && empty($parentId)) {
                $validator->errors()->add('parent_id', "Se requiere una ubicación padre para el nivel {$level}.");

                return;
            }

            if (! empty($parentId) && ! empty($level)) {
                $parent = Location::find($parentId);
                if ($parent !== null) {
                    $expectedParentLevels = [
                        'province' => 'country',
                        'city' => 'province',
                        'neighborhood' => 'city',
                    ];

                    $expected = $expectedParentLevels[$level] ?? null;
                    if ($expected !== null && $parent->level !== $expected) {
                        $validator->errors()->add('parent_id', "La ubicación padre para {$level} debe ser de nivel {$expected}.");
                    }
                }
            }
        });
    }
}
