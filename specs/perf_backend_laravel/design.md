# Design

## Archivos a modificar
- `backend/api/app/Http/Controllers/*Controller.php`: (Ej. `IncidenciaController.php` y `DashboardController.php`) Se modificarán los métodos que retornan colecciones o paginaciones para agregar el método `with()` a las llamadas de Eloquent. También se inyectará el uso de la fachada `Cache`.
- `backend/api/routes/api.php` o `backend/api/routes/web.php`: Se limpiarán de posibles closures para permitir que `php artisan route:cache` funcione sin excepciones.

## Firmas nuevas
- No se introducen firmas arquitectónicas nuevas a nivel de clases. Se extenderá el uso de métodos existentes del framework Laravel como `Cache::remember($key, $ttl, Closure)` en los repositorios o controladores pertinentes.

## Excepciones
- Se pueden propagar excepciones nativas del driver de caché de Laravel (ej. `RedisException`) si el servicio externo no está disponible. No se añaden excepciones de dominio nuevas para esta feature.

## Decisiones de Diseño y Alternativas Descartadas
- **Alternativa descartada:** Usar exclusivamente Eloquent (Modelos) con Eager Loading ilimitado, o por el contrario, llenar los Controladores de Raw SQL ilegible.
- **Justificación del descarte:** Hidratar masivamente modelos provoca Out of Memory (OOM). Por otro lado, escribir SQL crudo en los controladores destruye la mantenibilidad y rompe el patrón MVC.
- **Decisión adoptada para equilibrar Rendimiento y Mantenibilidad:**
  1. **Listados en API:** Se mantendrá Eloquent con Eager Loading (`with()`), pero acoplado obligatoriamente a paginación por cursor (`cursorPaginate()`).
  2. **Lectura masiva/métricas (Dashboard):** Se utilizará **Query Builder** (`DB::table`), pero estas consultas complejas **estarán rigurosamente encapsuladas** dentro de clases dedicadas utilizando el **Patrón Query Object** (ej. `App\Queries\DashboardMetricsQuery`). Así, el controlador permanece limpio, la lógica es testeable, y el SQL ultra-eficiente queda aislado.

## Fronteras con architecture.md y conventions.md
El proyecto define convenciones para un sistema CLI en Python (`storage.py`, `notes.py`), pero esta feature aplica específicamente al backend en Laravel según `feature_list.json`. Por tanto, se exime a esta feature de las reglas orientadas a Python puro y se adopta la arquitectura MVC y herramientas nativas de Laravel (Eloquent, Cache).
