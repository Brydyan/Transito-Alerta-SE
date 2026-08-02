<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Requests;

use App\Domains\Incidents\Http\Rules\CategoryIsLeafRule;
use App\Domains\Incidents\Http\Rules\GeomShapeRule;
use App\Domains\Incidents\Http\Rules\LocationGeomConsistentRule;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Shared\Services\InputSanitizer;
use App\Storage\ImageRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        if (! $user->can('create', Incident::class)) {
            return false;
        }

        if ($user->isRegularUser() && $this->has('organization_id')) {
            return false;
        }

        return true;
    }

    public function rules(): array
    {
        return [
            'title' => 'required_without:titulo|nullable|string|max:255',
            'titulo' => 'required_without:title|nullable|string|max:255',
            'description' => 'nullable|string|max:5000',
            'descripcion' => 'nullable|string|max:5000',
            'incident_category_id' => ['required', 'integer', 'exists:incident_categories,id', new CategoryIsLeafRule],
            'location_id' => ['nullable', 'integer', 'exists:locations,id', app(LocationGeomConsistentRule::class)],
            'priority' => ['required', Rule::in([Incident::PRIORITY_LOW, Incident::PRIORITY_MEDIUM, Incident::PRIORITY_HIGH])],
            'geom' => ['nullable', app(GeomShapeRule::class)],
            'organization_id' => 'nullable|integer|exists:organizations,id',

            // Imágenes opcionales (multipart)
            'images' => [...['nullable'], ...ImageRules::galleryArrayRules()],
            'images.*' => [...['nullable'], ...ImageRules::galleryFileRules()],
        ];
    }

    /**
     * Map Spanish API field names to database column names after validation.
     */
    public function validated($key = null, $default = null): mixed
    {
        $validated = parent::validated($key, $default);

        if (is_array($validated)) {
            if (array_key_exists('titulo', $validated)) {
                $validated['title'] = $validated['titulo'];
                unset($validated['titulo']);
            }
            if (array_key_exists('descripcion', $validated)) {
                $validated['description'] = $validated['descripcion'];
                unset($validated['descripcion']);
            }

            $validated = InputSanitizer::sanitizeRequest(
                $validated,
                textFields: ['title', 'description'],
            );
        }

        return $validated;
    }

    public function messages(): array
    {
        $titleRequired = 'El campo título es obligatorio.';

        return [
            'title.required_without' => $titleRequired,
            'titulo.required_without' => $titleRequired,
            'titulo.required' => $titleRequired,
            'titulo.max' => 'El título no puede superar los 255 caracteres.',
            'title.max' => 'El título no puede superar los 255 caracteres.',
            'incident_category_id.required' => 'La categoría de incidencia es obligatoria.',
            'incident_category_id.exists' => 'La categoría seleccionada no existe.',
            'location_id.exists' => 'La ubicación seleccionada no existe.',
            'priority.required' => 'La prioridad es obligatoria.',
            'priority.in' => 'La prioridad debe ser: baja, media o alta.',
            'images.max' => 'Puedes adjuntar un máximo de '.ImageRules::MAX_FILES.' imágenes.',
            'images.*.image' => 'Cada archivo debe ser una imagen.',
            'images.*.mimes' => 'Solo se permiten imágenes JPEG, PNG, WEBP o GIF.',
            'images.*.max' => 'Cada imagen no debe superar los '.(ImageRules::MAX_SIZE_KB / 1024).' MB.',
        ];
    }
}
