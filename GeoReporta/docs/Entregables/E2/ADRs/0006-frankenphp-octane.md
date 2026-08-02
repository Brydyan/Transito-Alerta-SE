# ADR-0006: Frankenphp + Laravel Octane

- **Status:** Superseded by [ADR-0007](./0007-migrate-octane-swoole.md)
- **Date:** 2026-07-07
- **Superseded on:** 2026-07-21
- **Deciders:** Equipo de Proyecto

> ⚠️ This ADR documents the state of the project as of July 7, 2026 and is preserved
> here for historical reference. The current runtime is Swoole under Octane; see
> [ADR-0007](./0007-migrate-octane-swoole.md) for the supersession rationale and
> what changed since.

## Context and Problem Statement

El SRS v2.0 tiene requisitos de performance (RF RR-002: API CRUD simple < 500ms). Con el stack tradicional de Laravel + php-fpm + nginx, cada request paga el costo de bootstrap del framework completo (~50-100ms en una app mediana). Para APIs con muchas requests pequeñas (e.g. polling del feed, tracking de operadores), ese bootstrap se nota.

¿Cómo servir Laravel con menor latencia por request sin sacrificar la simplicidad del framework?

## Considered Options

1. **PHP-FPM tradicional** (lo que viene por default con Laravel + nginx).
2. **Frankenphp + Laravel Octane** — Octane mantiene la app en memoria entre requests; Frankenphp es el servidor de aplicaciones que sirve los workers. **Elegido.**
3. **Frankenphp standalone sin Octane** — Frankenphp puede correr Laravel como cualquier otro framework PHP, sin el ciclo de vida de Octane.
4. **RoadRunner o Swoole** — alternativas a Frankenphp con modelos de workers similares.

## Decision Outcome

**Opción 2: Frankenphp + Laravel Octane.** El contenedor del backend corre `php artisan octane:start` con Frankenphp como driver. Cada request no paga el bootstrap del framework: la app está cargada en memoria y los requests se sirven directamente.

**Razones:**

- **Performance real**: latencia de CRUD simple baja de ~80ms (php-fpm) a ~5-10ms (Octane en memoria). El requisito RR-002 (< 500ms) se cumple holgadamente.
- **Frankenphp está escrito en Go** y soporta HTTP/3, early hints, y modern features out of the box.
- **No requiere Swoole** (que necesita extensión de PHP adicional y a veces complica el deploy con Docker).
- **Es oficial de Laravel**: Octane es first-class, con documentación y tooling maduro.
- **Misma API de Laravel**: el código de los controllers no cambia. Las migraciones, los tests, todo igual.

## Consequences

### Positive

- **Latencia mucho menor**: ideal para APIs con muchas requests pequeñas.
- **Throughput mayor**: menos CPU gastada en bootstrap = más capacidad por instancia.
- **Mismo código de aplicación**: controllers, services, policies — todo igual.
- **Stack oficial**: Octane es first-class en Laravel, con documentación y comunidad.

### Negative

- **State debe ser stateless**: cualquier singleton o static que guarde estado entre requests causará bugs sutiles. Ejemplo: una variable estática con datos del request anterior.
- **Testing más complejo**: los tests Feature deben ejecutarse contra una instancia de Octane o limpiar state manualmente.
- **Debugging más difícil**: cuando un bug es de state-leak, los logs no muestran nada obvio porque "funcionaba en el request anterior".
- **Migraciones durante runtime son riesgosas**: si se hace `php artisan migrate` mientras Octane está corriendo, los workers pueden tener la app cargada con el schema viejo.
- **Deploy más sensible**: hay que reiniciar Octane después de cada deploy (Octane::reload o restart del container).

## Implementation

**Archivos clave:**

- `backend/public/frankenphp-worker.php` — entry point del worker.
- `backend/config/octane.php` — configuración (server, workers, max requests).
- `backend/Dockerfile` — corre `php artisan octane:start` como entrypoint.
- `backend/.rr.yaml` — config alternativa (si se usa RoadRunner, no es nuestro caso).

**Cuidados de desarrollo (reglas del equipo):**

1. **Nunca** usar `static $foo` para guardar state entre requests.
2. Los singletons deben ser explícitamente stateless o usar `Octane::table()` para state compartido.
3. Después de cada deploy: `php artisan octane:reload` o restart del container.
4. En tests Feature: usar `RefreshDatabase` y `Octane::flush()` donde aplique.

**Forma de un controller — sin cambios respecto a Laravel tradicional:**

```php
public function show(Incident $incident): JsonResponse {
    $this->authorize('view', $incident);
    return IncidentResource::make($incident)->response();
}
```

## References

- [SRS v2.0 §3.3 RR-002 Tiempo de respuesta de API](../Requisitos/SRS.md#requisitos-de-rendimiento)
- [SRS v2.0 §2.4.2 Plataforma de Software](../Requisitos/SRS.md#242-plataforma-de-software)
- ADR-0005 JWT — Octane tiene consideraciones especiales para JWT (el secret no debe cambiar entre requests en memoria).
- [Laravel Octane docs](https://laravel.com/docs/12.x/octane)
- [Frankenphp docs](https://frankenphp.dev/)
