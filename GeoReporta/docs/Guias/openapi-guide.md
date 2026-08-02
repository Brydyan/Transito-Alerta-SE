# OpenAPI — Scramble

La API usa [Scramble](https://scramble.dedoc.co/) (`dedoc/scramble`) para generar la especificación OpenAPI 3.1 automáticamente desde el código, sin necesidad de anotaciones PHPDoc.

## Acceder a la documentación

| Recurso | URL |
|---------|-----|
| UI interactiva (Scalar) | `http://localhost:8000/docs/api` |
| Spec JSON | `http://localhost:8000/docs/api.json` |
| Export estático | `api.json` (en la raíz del backend) |

## Comandos

```bash
# Exportar spec a api.json
php artisan scramble:export

# Cachear spec (para producción)
php artisan scramble:cache

# Limpiar cache de spec
php artisan scramble:clear
```

## Cómo funciona

Scramble infiere la documentación de:

- **Rutas** — las rutas registradas en `routes/api.php`
- **Modelos** — los atributos y tipos de las columnas (casts, migrations)
- **Validación** — las reglas de `FormRequest` (campos requeridos, tipos, formatos)
- **Middleware** — rutas con `auth:sanctum` se marcan como protegidas con Bearer token

No necesitás escribir nada extra para endpoints básicos.

## Mejorar la documentación

### Atributos en el controlador

Para documentar el `operationId`, título, o response personalizado:

```php
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Response;

#[Endpoint(operationId: 'incidencias.store', title: 'Crear incidencia')]
#[Response(status: 201, type: IncidenciaResource::class)]
public function store(StoreIncidenciaRequest $request): JsonResponse
{
    // ...
}
```

### Parámetros de ruta

```php
use Dedoc\Scramble\Attributes\PathParameter;

#[PathParameter(name: 'id', type: 'integer', description: 'ID de la incidencia')]
public function show(int $id): JsonResponse
{
    // ...
}
```

### Recursos / API Resources

Scramble infiere el schema de respuesta de las `API Resource` classes. Si usás `IncidenciaResource` que extiende `JsonResource`, los campos se documentan automáticamente.

### FormRequests

Scramble lee las reglas del `FormRequest` para documentar el request body:

```php
class StoreIncidenciaRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'titulo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'ubicacion_id' => ['required', 'exists:ubicaciones,id'],
        ];
    }
}
```

Esto genera el schema, campos requeridos, y tipos automáticamente.

### Respuestas personalizadas

Para documentar un status code específico que devolvés manualmente:

```php
use Dedoc\Scramble\Attributes\Response;
use Dedoc\Scramble\Attributes\ResponseFile;

#[Response(status: 403, description: 'No tienes permiso para esta acción')]
public function destroy(int $id): JsonResponse
{
    // ...
}

// O desde un archivo JSON de ejemplo
#[ResponseFile(status: 200, resource: 'responses/incidencia.json')]
```

## Configuración

`config/scramble.php`:

- **`renderer`** — `'scalar'` usa Scalar UI; `'elements'` usa Stoplight Elements
- **`security_strategy`** — detecta rutas protegidas con `auth:sanctum` y las documenta con Bearer token
- **`api_path`** — prefijo de rutas a documentar (`'api'`)
- **`info`** — título, versión, descripción de la API

## Flujo de trabajo

1. Creás el endpoint con su controlador y FormRequest
2. Scramble lo detecta automáticamente al visitar `/docs/api`
3. Para producción, corré `php artisan scramble:cache` y verificás que la spec se vea bien
4. Si algo no se documenta correctamente, agregás atributos `#[Endpoint]` o `#[Response]`

## Notas

- Scramble es **read-only**: la spec se genera en runtime o se cachea. No edites `api.json` manualmente.
- El cache se invalida solo explícitamente con `scramble:clear` o cambiando `config/scramble.php`.
- Si el renderer "scalar" no carga la UI, cambiá a `'renderer' => 'elements'` en la config.
