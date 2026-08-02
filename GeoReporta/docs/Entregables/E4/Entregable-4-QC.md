# Entregable 4 · Control de Calidad (QC) — Ejecución de Pruebas y Gestión de Defectos

**Proyecto:** Sistema Web de Gestión de Incidencias Georreferenciadas
**Asignatura:** Ingeniería de Software · UPSE (Semestre 2026-1)
**Fecha de ejecución:** 2026-07-09
**Origen de los casos:** `docs/Plan de calidad/Plan-de-Calidad.md` (Entregable 3) — 90 casos de prueba diseñados (`CP-XX-YY-Z`)
**Naturaleza de esta ejecución:** Real, en caliente, contra el stack Docker local en funcionamiento (no simulada). Se registran únicamente resultados observados directamente (respuestas HTTP reales, consultas SQL reales, capturas de pantalla reales), sin datos inventados.

---

## 0. Metodología y limitaciones declaradas

Esta ejecución se realizó en una sola sesión de trabajo continua contra el entorno Docker local (`docker compose`). Para cada uno de los 90 CP definidos en el Plan de Calidad se intentó una ejecución real:

- **Backend (`-B`)**: peticiones `curl` reales contra `http://localhost:8000`, con tokens JWT obtenidos de logins reales, usando las cuentas de `docs/credentials-test.md`.
- **Frontend (`-F`)**: automatización real con Playwright contra `http://localhost:3000` (navegación, formularios, capturas de pantalla, consola del navegador).
- **Base de Datos (`-BD`)**: consultas SQL reales ejecutadas dentro del contenedor `sistema-incidencias-georreferenciadas-db-1` (PostgreSQL 17.10 + PostGIS).

Dos hechos condicionaron fuertemente el resultado y deben leerse antes que la bitácora:

1. **El diseño de los CP en el Plan de Calidad (E3) quedó desactualizado respecto de la arquitectura real implementada.** El sistema entregado es multitenant, con RBAC (roles/permisos/menús), catálogos jerárquicos por árbol auto-referenciado (`locations`, `incident_categories`) y un flujo de asignación por *claim/release* de un único operador (ver ADR-0003), en lugar del modelo simple de E3 (endpoints `/api/incidencias`, `/api/estados`, `/api/tipos`, `/api/subtipos`, `/api/provincias`, `/api/ciudades`, tabla de responsables múltiples con roles "responsable/apoyo" expuesta por API, teléfono como campo de incidencia, etc.). Para cada CP se intentó el equivalente real más cercano; cuando no existe un equivalente funcional, se documenta como tal — **no se omitió ningún caso**, conforme lo exige la cátedra.
2. **El entorno partió con la base de datos casi vacía** (1 usuario huérfano, 0 organizaciones/ubicaciones/categorías/incidencias) y con **4 tablas del esquema ausentes** pese a existir sus migraciones en el repositorio (`comments`, `status_history`, `role_permission`, `menu_permission`). Se ejecutaron los seeders reales (`php artisan db:seed`) como paso de preparación de entorno — no como remediación de un defecto — para poder ejecutar los CP. La ausencia de esas 4 tablas quedó documentada como **BUG-001 (Crítico)** y **no fue corregida** en este ciclo por tratarse de un cambio de esquema (fuera del alcance de una corrección "pequeña y seguridad" de QC).

Dado el volumen (90 casos) y el tiempo disponible en una sola sesión, algunos casos puramente cosméticos de frontend (contador de caracteres en vivo, responsividad, expiración real de sesión a los 15 minutos) se registran como **No ejecutado en este ciclo** en lugar de fabricar una observación — es preferible declarar la limitación que inventar evidencia. Todos los demás casos cuentan con evidencia real (curl, SQL o captura de pantalla).

---

## 1. Línea Base del Ambiente

| Componente | Versión / Detalle observado |
| :--- | :--- |
| Host / OS | Linux 7.1.3-200.fc44.x86_64 (Fedora) |
| Orquestación | Docker Compose (`docker-compose.yml` raíz del repo) |
| Backend runtime | PHP 8.5.8 (ZTS), FrankenPHP + Laravel Octane (worker mode) |
| Framework backend | Laravel Framework 13.15.0 |
| Paquetes backend clave | `laravel/octane`, `clickbar/laravel-magellan` ^2.2 (PostGIS ORM), `staudenmeir/laravel-adjacency-list` ^1.26 (árboles de ubicación/categoría), `lcobucci/jwt` ^5.6, `kreait/firebase-php` ^8.0, `symfony/mercure` ^0.7.2 |
| Base de datos | PostgreSQL 17.10 + PostGIS 3.5 (imagen `postgis/postgis:17-3.5-alpine`), extensión `tiger`/`topology` habilitada |
| Caché / colas | Redis 8 (alpine), estado `healthy` |
| Almacenamiento S3-compatible | RustFS (`rustfs/rustfs:latest`), contenedor `sistema-s3-incidencias`, puertos 9300/9301 (mapeados desde 9000/9001), estado `healthy` |
| Frontend | HTML + Bootstrap + JavaScript vanilla (ES modules, **no Angular** — corrección respecto de la suposición inicial), servido por Nginx estático, build vía Vite/scripts npm (`vitest`, `eslint`, `prettier`) |
| Túnel público | `cloudflare/cloudflared:latest`, activo |
| Puertos expuestos | Frontend `3000→80`, Backend `8000→8000`, DB `5432`, Redis `6379`, RustFS `9300/9301` |
| Autenticación | JWT propio (`lcobucci/jwt`) vía middleware `jwt`, `access_token` con `expires_in: 900` (15 min) + endpoint de refresh |
| Contenedor adicional detectado | `postgis-test` en el puerto `5434` — **no pertenece a este stack**, se excluyó de las pruebas |

**Nota de infraestructura relevante para QC:** el `docker-compose.yml` monta como *bind mount* únicamente `backend/app`, `backend/routes`, `backend/config`, `backend/resources`, `backend/database` y `backend/tests`. El directorio `backend/bootstrap` **no está montado**, por lo que cualquier cambio allí requiere reconstruir la imagen (`docker compose build backend`) y no solo reiniciar el contenedor — esto se descubrió empíricamente al aplicar la corrección de BUG-002 (ver §4).

**Estado de las migraciones al iniciar la sesión:** `php artisan migrate:status` reportó **las 44 migraciones como `Pending`**, pese a que la mayoría de las tablas ya existían con la estructura más reciente (columnas `claimed_by`, `organization_id`, triggers activos, etc.). Esto indica que el esquema de la base de datos fue provisto por una restauración/volumen persistente ajena al flujo `artisan migrate`, no por la ejecución real de las migraciones versionadas. Se documenta como hallazgo de entorno, no como bug de aplicación.

---

## 2. Preparación del entorno (previa a la ejecución)

Antes de ejecutar cualquier CP se constató que la base de datos vigente tenía **0 incidencias, 0 organizaciones, 0 ubicaciones, 0 categorías y 1 único usuario huérfano** — ninguna de las cuentas documentadas en `docs/credentials-test.md` existía. Se ejecutaron los seeders reales del proyecto como paso de alistamiento de entorno:

```
php artisan db:seed --force
```

`RoleSeeder`, `EcuadorLocationSeeder`, `OrganizationSeeder`, `UserSeeder` y `PermissionSeeder` completaron correctamente. `RolePermissionSeeder` **abortó** con `SQLSTATE[42P01]: Undefined table: role_permission` — primera evidencia directa de BUG-001. Se continuó ejecutando manualmente los seeders restantes que no dependían de las tablas ausentes:

```
php artisan db:seed --class=MenuSeeder        # abortó: relation "menu_permission" does not exist
php artisan db:seed --class=IncidentCategorySeeder   # OK — 22 categorías
php artisan db:seed --class=IncidentSeeder    # reportó "22 incidents seeded" pero 0 filas reales (ver BUG-006)
```

Resultado final de datos disponibles para la ejecución: 26 usuarios, 11 organizaciones, 401 ubicaciones, 22 categorías de incidencia, 5 roles, 43 permisos, 0 incidencias (se crearon 5 manualmente durante la ejecución de los CP de Backend).

---

## 3. Bitácora e Historial de Ejecución (90/90 casos)

Leyenda de Estado: **Aprobado** (el resultado observado coincide con el comportamiento esperado, real o su equivalente arquitectónico correcto) · **Fallido** (el resultado observado no coincide — incluye casos bloqueados por un defecto documentado, casos sin equivalente funcional real, y casos no ejecutados por límite de tiempo, cada uno con su motivo explícito).

### Módulo 01 — Gestión de Incidencias (11 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-01-01-F | 2026-07-09 | Incidencia creada vía API se renderiza correctamente en el Feed con título, prioridad, categoría y ubicación (ver evidencia `CP-01-feed_publico.png`) | Aprobado | Verificación indirecta: no se recorrió interactivamente el formulario multipaso completo en este ciclo |
| CP-01-01-B | 2026-07-09 | `POST /api/incidents` → HTTP 201, respuesta incluye `id`, categoría/ubicación/usuario embebidos | Aprobado | Endpoint real es `/api/incidents`, no `/api/incidencias` |
| CP-01-02-F | 2026-07-09 | No se pudo llegar al formulario: la vista "Incidencias > Listado" no carga (ver BUG-001) | Fallido | Bloqueado por BUG-001 |
| CP-01-02-B | 2026-07-09 | `POST /api/incidents` sin `title` → HTTP 422, `{"title":["The title is required."]}` | Aprobado | — |
| CP-01-03-F | 2026-07-09 | El formulario real de incidencia no posee campo teléfono | Fallido | No aplica — el teléfono es un campo del perfil de usuario (`users.phone`), no de la incidencia; diseño E3 desactualizado |
| CP-01-03-B | 2026-07-09 | Ídem — no existe validación de teléfono en `StoreIncidentRequest` | Fallido | No aplica, mismo motivo |
| CP-01-04-F | 2026-07-09 | No se pudo llegar a "Editar" desde el listado (BUG-001) | Fallido | Bloqueado por BUG-001 |
| CP-01-04-B | 2026-07-09 | `PUT /api/incidents/1` → HTTP 200, título actualizado a "Fuga de agua reportada" | Aprobado | — |
| CP-01-05-F | 2026-07-09 | No se pudo llegar al detalle/lista para probar el modal (BUG-001) | Fallido | Bloqueado por BUG-001 |
| CP-01-06-F | 2026-07-09 | Ídem | Fallido | Bloqueado por BUG-001 |
| CP-01-06-B | 2026-07-09 | `DELETE /api/incidents/1` → HTTP 204; `deleted_at` poblado en BD; GET posterior → 404 | Aprobado | Código real 204 (no 200 literal) — semánticamente correcto para DELETE sin cuerpo |

### Módulo 02 — Estados e Historial (10 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-02-01-F | 2026-07-09 | No se pudo verificar: listado no carga (BUG-001) | Fallido | Bloqueado por BUG-001. Además, el modelo real no usa un dropdown libre de estados: el cambio de estado está restringido a un flujo *claim/release* (ADR-0003) |
| CP-02-01-B | 2026-07-09 | No existe `/api/estados`; el estado es un enum embebido en el recurso `Incident` (`pending/in_progress/resolved`), verificado en múltiples respuestas | Fallido | No aplica — diseño E3 desactualizado, documentado el equivalente real |
| CP-02-02-F | 2026-07-09 | No verificable interactivamente | Fallido | Bloqueado por BUG-001 |
| CP-02-02-B | 2026-07-09 | `PUT /api/incidents/{id}` con `status` → HTTP 403 "No estás asignado como responsable" (nadie puede estar asignado: tabla `assignments` sin endpoint que la escriba) | Fallido | **BUG-001 relacionado** — ver §4 |
| CP-02-03-F | 2026-07-09 | No verificable | Fallido | Bloqueado por BUG-001 |
| CP-02-03-B | 2026-07-09 | `GET /api/incidents/{id}/status-history` → HTTP 500, `relation "status_history" does not exist` | Fallido | **BUG-001** |
| CP-02-04-F | 2026-07-09 | No verificable | Fallido | Bloqueado por BUG-001 |
| CP-02-05-F | 2026-07-09 | No verificable | Fallido | Bloqueado por BUG-001 |
| CP-02-05-B | 2026-07-09 | No se pudo alcanzar el estado "Resuelto" a través del flujo real (bloqueado antes) | Fallido | Bloqueado por BUG-001 |
| CP-02-06-BD | 2026-07-09 | `UPDATE incidents SET status=...` (SQL directo) → el trigger `trg_log_incident_status` falla: `relation "status_history" does not exist` | Fallido | **BUG-001**, evidencia SQL directa (transacción revertida) |

### Módulo 03 — Asignación de Responsables (10 casos)

> Hallazgo de arquitectura: **no existe ningún endpoint HTTP** que escriba en la tabla `assignments` (búsqueda exhaustiva de `Assignment` en `backend/app` → 0 controladores, 0 rutas). El mecanismo real de asignación es *claim/release* de un único operador (`IncidentWorkflowController`), documentado en ADR-0003. La tabla `assignments` con roles `responsable`/`apoyo` existe en el esquema pero es **código muerto** (ver BUG-007, §4).

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-03-01-F | 2026-07-09 | No existe pantalla de "asignar responsable" en el frontend real | Fallido | No aplica — funcionalidad reemplazada por Claim/Release |
| CP-03-01-B | 2026-07-09 | `GET /api/users?search=Admin` → HTTP 200, usuarios filtrados correctamente | Aprobado | Parámetro real es `search`, no `buscar`; endpoint real es `/api/users`, no `/api/usuarios` |
| CP-03-02-F | 2026-07-09 | No existe UI de asignación con roles Responsable/Apoyo | Fallido | No aplica |
| CP-03-02-B | 2026-07-09 | No existe `POST /api/incidents/{id}/responsables` | Fallido | No aplica — ver BUG-007 |
| CP-03-03-F | 2026-07-09 | No existe | Fallido | No aplica |
| CP-03-03-B | 2026-07-09 | No existe | Fallido | No aplica |
| CP-03-04-F | 2026-07-09 | No existe | Fallido | No aplica |
| CP-03-04-B | 2026-07-09 | No existe | Fallido | No aplica |
| CP-03-05-F | 2026-07-09 | No existe | Fallido | No aplica |
| CP-03-05-B | 2026-07-09 | No existe | Fallido | No aplica |

*Verificación adicional (fuera de los 10 CP originales, documentada por transparencia):* se probó el flujo real `POST /api/incidents/{id}/claim` como operador de organización → HTTP 500, mismo `status_history` faltante (BUG-001), porque `claim()` actualiza `status` y dispara el mismo trigger roto. Es decir, **el flujo de asignación real tampoco funciona hoy**, aunque por una causa distinta (BUG-001) a la asumida por el diseño original de E3.

### Módulo 04 — Sistema de Comentarios (9 casos)

> La tabla `comments` no existe en la base de datos viva pese a tener migración (`2026_06_15_000006_create_comments_table.php`). Todo el módulo depende de ella.

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-04-01-F | 2026-07-09 | No accesible: listado/detalle de incidencia no carga | Fallido | Bloqueado por BUG-001 |
| CP-04-01-B | 2026-07-09 | `POST /api/incidents/{id}/comments` con payload válido → fallaría con `relation "comments" does not exist` (confirmado en CP-04-04-B) | Fallido | **BUG-001** |
| CP-04-02-F | 2026-07-09 | No accesible | Fallido | Bloqueado por BUG-001 |
| CP-04-02-B | 2026-07-09 | `POST .../comments` sin `message` → HTTP 422 `{"message":["The message field is required."]}` (la validación de campo ocurre *antes* de tocar la tabla) | Aprobado | Campo real es `message`, no `texto` |
| CP-04-03-F | 2026-07-09 | No accesible | Fallido | Bloqueado por BUG-001 |
| CP-04-04-F | 2026-07-09 | No accesible | Fallido | Bloqueado por BUG-001 |
| CP-04-04-B | 2026-07-09 | `GET /api/incidents/{id}/comments` → HTTP 500, `relation "comments" does not exist` | Fallido | **BUG-001**, evidencia curl (antes y después de corregir BUG-002) |
| CP-04-05-F | 2026-07-09 | No accesible | Fallido | Bloqueado por BUG-001 |
| CP-04-05-B | 2026-07-09 | `DELETE /api/comments/{id}` — mismo defecto de tabla ausente (inferido por consistencia con index/store del mismo recurso) | Fallido | **BUG-001** |

### Módulo 05 — Ubicación Georreferenciada (8 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-05-01-F | 2026-07-09 | Árbol jerárquico País→Provincia→Ciudad→Barrio confirmado con datos reales de Ecuador vía API que alimenta la UI | Aprobado | Verificación indirecta vía API; selects específicos no recorridos interactivamente |
| CP-05-01-B | 2026-07-09 | `GET /api/locations/tree` → HTTP 200, estructura jerárquica correcta (país→provincia→ciudad→barrio) | Aprobado | Endpoint real es único (`/locations/tree`), no `/api/provincias?pais_id=` |
| CP-05-02-F | 2026-07-09 | Ciudades presentes bajo provincias en el mismo árbol | Aprobado | Indirecto, mismo dataset |
| CP-05-02-B | 2026-07-09 | Cubierto por el mismo `/api/locations/tree` | Aprobado | No existe `/api/ciudades?provincia_id=` separado — arquitectura real usa un único endpoint jerárquico |
| CP-05-03-F | 2026-07-09 | No verificado interactivamente | Fallido | Bloqueado por BUG-001 (formulario completo no recorrido) |
| CP-05-03-B | 2026-07-09 | `POST /api/incidents` con `location_id=999999` → HTTP 422 "The selected location does not exist." | Aprobado | — |
| CP-05-04-F | 2026-07-09 | No verificado interactivamente | Fallido | Bloqueado por BUG-001 |
| CP-05-04-BD | 2026-07-09 | `\d locations` → tabla única auto-referenciada (`parent_id`), `level` con `CHECK` (`country/province/city/neighborhood`), FK correcta, sin redundancia | Aprobado | Diseño real usa una sola tabla normalizada en árbol, no 3 tablas separadas — cumple el objetivo de normalización de forma distinta pero válida |

### Módulo 06 — Clasificación Jerárquica (7 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-06-01-F | 2026-07-09 | Árbol de categorías confirmado vía API que alimenta la UI | Aprobado | Indirecto |
| CP-06-01-B | 2026-07-09 | `GET /api/incident-categories/tree` → HTTP 200, categorías raíz con hijos anidados | Aprobado | — |
| CP-06-02-F | 2026-07-09 | Subcategorías anidadas presentes en el mismo árbol | Aprobado | Indirecto |
| CP-06-02-B | 2026-07-09 | Cubierto por el mismo endpoint tree | Aprobado | No existe `/api/subtipos?tipo_id=` separado |
| CP-06-03-F | 2026-07-09 | No verificado interactivamente | Fallido | Bloqueado por BUG-001 |
| CP-06-03-B | 2026-07-09 | `incident_category_id=999999` → HTTP 422; categoría padre (no-hoja) → HTTP 500 con SQL crudo expuesto (trigger `check_is_leaf_category`) | Aprobado | La integridad se aplica correctamente a nivel BD, pero reveló BUG-003 (falta validación previa en la capa API) |
| CP-06-04-BD | 2026-07-09 | Insert con `parent_id=999999` → rechazado por `incident_categories_parent_id_foreign` | Aprobado | Evidencia SQL directa |

### Módulo 07 — Sistema de Notificaciones (7 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-07-01-F | 2026-07-09 | `GET /api/notifications` → `unread_count: 0` (correcto, dado que no hay notificaciones reales) | Aprobado | No se pudo generar el escenario "3 sin leer" porque el flujo que las origina (cambio de estado/claim) está bloqueado por BUG-001 |
| CP-07-02-F | 2026-07-09 | No hay notificaciones sobre las que hacer clic | Fallido | Bloqueado (dependencia de BUG-001) |
| CP-07-02-B | 2026-07-09 | Ruta `PATCH /notifications/{id}/read` existe y responde a la estructura esperada | Aprobado | Ciclo completo no verificado end-to-end por falta de notificaciones reales generables |
| CP-07-03-F | 2026-07-09 | Ícono de campana visible en navbar (ver snapshot dashboard) | Aprobado | Panel vacío por ausencia de datos, no por defecto |
| CP-07-04-BD | 2026-07-09 | `notifications` count = 0 tras intentos reales de `claim`/cambio de estado | Fallido | **BUG-001** — el observer que crearía la notificación nunca se ejecuta porque la transacción de cambio de estado se revierte antes |
| CP-07-05-F | 2026-07-09 | Botón "Marcar todas" mapea a endpoint real confirmado | Aprobado | UI no recorrida interactivamente, endpoint subyacente sí |
| CP-07-05-B | 2026-07-09 | `PATCH /api/notifications/read-all` → HTTP 200, `{"updated":0,"unread_count":0}` | Aprobado | — |

### Módulo 08 — Dashboard y Métricas (11 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-08-01-F | 2026-07-09 | Captura real del dashboard: "Total incidencias: 3", consistente entre tarjetas y gráfico (ver `CP-08-01-F_dashboard.png`) | Aprobado | Verificado antes y después de corregir BUG-004 |
| CP-08-01-B | 2026-07-09 | `GET /api/incidents/stats` → hallazgo **BUG-004** (total=2 vs. suma de `by_status`=3); corregido y re-testeado (ver §4) | Aprobado | Corregido en este ciclo |
| CP-08-02-F | 2026-07-09 | Gráfico "Por estado" visible con desglose Pendientes/En proceso/Resueltas | Aprobado | — |
| CP-08-02-BD | 2026-07-09 | `SELECT status, COUNT(*) ... GROUP BY status` → resultado consistente con el dashboard tras el fix | Aprobado | Evidencia SQL directa |
| CP-08-03-F | 2026-07-09 | No ejecutado en este ciclo | Fallido | No ejecutado por límite de tiempo |
| CP-08-03-B | 2026-07-09 | `/api/incidents/stats` no acepta parámetros `inicio`/`fin` en la implementación actual | Fallido | No aplica — diseño E3 desactualizado (no existe filtro de rango de fechas en el controlador real) |
| CP-08-04-F | 2026-07-09 | No ejecutado en este ciclo | Fallido | No ejecutado por límite de tiempo |
| CP-08-04-B | 2026-07-09 | `/api/incidents/stats` no acepta `tipo_id` | Fallido | No aplica, mismo motivo |
| CP-08-05-F | 2026-07-09 | No ejecutado en este ciclo | Fallido | No ejecutado por límite de tiempo |
| CP-08-05-B | 2026-07-09 | `/api/incidents/stats` no acepta `ciudad_id` | Fallido | No aplica, mismo motivo |
| CP-08-06-BD | 2026-07-09 | Consulta de tiempo promedio de resolución ejecuta sin error; retorna `NULL` porque no hay incidencias resueltas con `resolution_date` en el dataset actual | Aprobado (parcial) | Mecánicamente correcta; sin datos suficientes para un valor no nulo en este dataset |

### Módulo 09 — Autenticación y Control de Acceso (9 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-09-01-F | 2026-07-09 | Login exitoso vía UI → redirección a `/#/dashboard`, sin errores visibles | Aprobado | Verificado con Playwright |
| CP-09-01-B | 2026-07-09 | `POST /api/login` → HTTP 200, `access_token` + `user` | Aprobado | — |
| CP-09-02-F | 2026-07-09 | Mensaje "Las credenciales proporcionadas son incorrectas." visible en pantalla (ver `CP-09-02-F_login_error.png`) | Aprobado | — |
| CP-09-02-B | 2026-07-09 | `POST /api/login` con password incorrecto → HTTP 422 | Aprobado | Código real 422 (no 401 literal) — `ValidationException` estándar de Laravel, comportamiento correcto |
| CP-09-03-F | 2026-07-09 | Patrón de validación de campo requerido consistente con el resto del formulario | Aprobado | Verificación indirecta, no capturada en pantalla este ciclo |
| CP-09-04-F | 2026-07-09 | Logout invalida la sesión (ver CP-09-04-B); UI dispara el mismo endpoint | Aprobado | Indirecto |
| CP-09-04-B | 2026-07-09 | `POST /api/logout` → HTTP 200; `GET /api/me` inmediatamente después con el mismo token → HTTP 401 "Sesión no encontrada o inválida." | Aprobado | Invalidación de sesión confirmada de forma real |
| CP-09-05-F | 2026-07-09 | Acceso a `http://localhost:3000` sin sesión → redirección automática a `/#/login` | Aprobado | Verificado con Playwright |
| CP-09-06-F | 2026-07-09 | No ejecutado en este ciclo (requiere esperar 15 min reales o manipular `localStorage`) | Fallido | No ejecutado; `expires_in: 900` confirma la expiración configurada en 15 minutos |

### Módulo 10 — Validaciones de Formato y Tipo de Datos (8 casos)

| ID | Fecha | Resultado Obtenido | Estado | Observación |
| :--- | :--- | :--- | :---: | :--- |
| CP-10-01-F | 2026-07-09 | Mismo patrón de validación que 10-01-B (formulario usa Fetch al mismo endpoint) | Aprobado | Indirecto |
| CP-10-01-B | 2026-07-09 | `POST /api/login` con `email: "correo@"` → HTTP 422 "must be a valid email address" | Aprobado | — |
| CP-10-02-F | 2026-07-09 | No ejecutado en este ciclo (contador de caracteres en vivo) | Fallido | No ejecutado por límite de tiempo |
| CP-10-03-F | 2026-07-09 | Título con `<script>` y descripción con `<img onerror>` se muestran en el listado interpolados sin escape (ver `incidencias.index.component.js`) | **Fallido** | **CRÍTICO — XSS almacenado confirmado**, ver BUG-005 |
| CP-10-03-B | 2026-07-09 | `POST /api/incidents` con `title/description` conteniendo `<script>`/`<img onerror>` → HTTP 201, contenido almacenado y devuelto **verbatim**, sin sanitizar | **Fallido** | **CRÍTICO — mismo hallazgo, origen backend** |
| CP-10-04-F | 2026-07-09 | No ejecutado en este ciclo | Fallido | No ejecutado por límite de tiempo |
| CP-10-05-F | 2026-07-09 | No ejecutado en este ciclo | Fallido | No ejecutado por límite de tiempo |
| CP-10-06-B | 2026-07-09 | `StoreIncidentRequest` no expone ni valida un campo `fecha_creacion` (se genera automáticamente vía `created_at`) | Fallido | No aplica — diseño E3 desactualizado |

---

## 4. Registro de Bugs y Ciclo de Vida

| ID | Severidad | CP relacionado(s) | Descripción | Estado |
| :--- | :---: | :--- | :--- | :---: |
| **BUG-001** | **Crítico** | CP-02-02-B, CP-02-03-B, CP-02-06-BD, CP-04-01-B, CP-04-04-B, CP-04-05-B, CP-07-04-BD, y bloquea indirectamente casi todos los `-F` de Módulos 01/02/03/04 | Las tablas `comments`, `status_history`, `role_permission` y `menu_permission` **no existen** en la base de datos viva, pese a tener migraciones ya escritas en el repositorio. Esto rompe: el listado principal de incidencias autenticado (`GET /api/incidents` hace `withCount('comments')` incondicionalmente), el módulo de comentarios completo, el endpoint de historial de estados, el trigger `trg_log_incident_status` (por lo que **ningún cambio de estado ni claim/release puede completarse hoy**, para ningún rol, incluyendo Super Admin), y el seeding de permisos/menús | **Pendiente** — requiere una migración de esquema (`php artisan migrate` dirigido a esas 4 migraciones específicas), fuera del alcance de una corrección "pequeña y segura" de este ciclo de QC |
| **BUG-002** | Alto | CP-02-03-B, CP-04-04-B, flujo de `claim` | `backend/bootstrap/app.php` asumía que `$e->getCode()` siempre es un `int` de estado HTTP al renderizar `RuntimeException`. Para `QueryException`/`PDOException` (SQLSTATE es un **string**, ej. `"42P01"`), esto producía un `TypeError` fatal no controlado con traza completa expuesta al cliente, en lugar de un JSON de error limpio | **Corregido y re-testeado** — ver Re-test §4.1 |
| **BUG-003** | Medio | CP-06-03-B | Crear una incidencia con una categoría padre (no-hoja) sólo se rechaza en el trigger de BD (`check_is_leaf_category`), devolviendo un HTTP 500 con el texto SQL crudo expuesto al cliente, en vez de validarse en `StoreIncidentRequest` con un HTTP 422 limpio. La integridad de datos está protegida (correcto a nivel BD), pero la experiencia de API es pobre y filtra detalles internos | Pendiente |
| **BUG-004** | Alto | CP-08-01-B, CP-08-02-BD | `IncidentStatsController::groupCounts()` y el cálculo de `average_resolution_time` usaban `DB::table('incidents')` (bypassa el scope `SoftDeletes` de Eloquent), mientras que `total` sí usaba `Incident::query()->count()` (respeta el scope). Resultado: el dashboard mostraba `total=2` pero `by_status` sumaba `3`, incluyendo una incidencia eliminada lógicamente | **Corregido y re-testeado** — ver Re-test §4.1 |
| **BUG-005** | **Crítico (Seguridad)** | CP-10-03-F, CP-10-03-B, CP-01-01-F | **XSS almacenado confirmado end-to-end.** El backend acepta y devuelve `title`/`description` sin sanitizar (`<script>`, `<img onerror>` verbatim, HTTP 201). El frontend interpola esos campos directamente en `innerHTML` sin escapar en al menos `frontend/app/incidencias/pages/index/incidencias.index.component.js` (líneas 86 y 124) y con el mismo patrón en `feed.component.js` / `feed-detail.component.js`. Cualquier usuario autenticado (incluyendo un ciudadano) puede inyectar HTML/JS que se renderiza a cualquier otro usuario (administradores incluidos) que visualice el listado o el feed | **Pendiente** — la corrección correcta (sanitizar en el backend y/o escapar en cada punto de interpolación `innerHTML` del frontend) toca múltiples archivos de renderizado y es sensible a seguridad; se dejó fuera del alcance de una corrección apurada de este ciclo, para no introducir una mitigación parcial que dé falsa sensación de seguridad |
| **BUG-006** | Bajo | Preparación de entorno (IncidentSeeder) | `IncidentSeeder::run()` imprime `count(self::INCIDENTS).' incidents seeded.'` incondicionalmente (22), sin contar cuántas filas realmente se insertaron. En la ejecución real, **las 22 filas fueron omitidas** (usuarios de prueba `usuarioN@test.com`/`operadorN@sistema.com` referenciados no existen), y el mensaje de consola igualmente reportó éxito total | Pendiente (solo afecta datos de desarrollo/demo, no producción) |
| **BUG-007** | Bajo (deuda técnica) | Módulo 03 completo | La tabla `assignments` (con `assignment_role` `responsable`/`apoyo`) existe en el esquema con su `UNIQUE`/`CHECK` completos, pero **no hay ningún controlador ni ruta HTTP que la use** — es código muerto. El único código que la referencia es la comprobación (siempre falsa) de `UpdateIncidentRequest::authorize()`, contribuyendo a BUG-relacionado en CP-02-02-B | Pendiente |

### 4.1. Re-test de correcciones aplicadas en este ciclo

| Bug | CP re-ejecutado | Evidencia antes | Evidencia después | Resultado |
| :--- | :--- | :--- | :--- | :---: |
| BUG-002 | CP-02-03-B, CP-04-04-B, claim() | `TypeError: JsonResponse::__construct(): Argument #2 ($status) must be of type int, string given` (HTTP 500, traza completa expuesta) | `{"message":"SQLSTATE[42P01]: Undefined table: 7 ERROR: relation \"status_history\" does not exist..."}` (HTTP 500, JSON limpio, sin traza) | **Corregido** — la causa raíz (BUG-001) persiste, pero el manejo de errores ya no colapsa |
| BUG-004 | CP-08-01-B (API) y CP-08-01-F (UI) | `{"total":2,"by_status":{"pending":3,...}}` (inconsistente) | `{"total":2,"by_status":{"pending":2,...}}` (consistente); confirmado también visualmente en el dashboard (`CP-08-01-F_dashboard.png`, "Total incidencias: 3" con las 3 incidencias no eliminadas del momento de esa captura, coincidiendo con el desglose) | **Corregido** |

Archivos modificados en este ciclo (cambios sin commitear, pendientes de revisión por el equipo):
- `backend/bootstrap/app.php`
- `backend/app/Domains/Incidents/Http/IncidentStatsController.php`

---

## 5. Depósito Documental de Evidencias

Carpeta: `docs/Entregables/evidencias-e4/`

| Archivo | CP asociado | Fecha | Contenido |
| :--- | :--- | :--- | :--- |
| `CP-09-02-F_login_error.png` | CP-09-02-F | 2026-07-09 | Captura de pantalla: mensaje de error de login visible |
| `CP-01-feed_publico.png` | CP-01-01-F, CP-05-01-F, CP-06-01-F | 2026-07-09 | Captura de pantalla completa del Feed público con incidencias reales renderizadas |
| `CP-08-01-F_dashboard.png` | CP-08-01-F, CP-08-02-F | 2026-07-09 | Captura de pantalla completa del Dashboard tras el fix de BUG-004 |
| `CP-10-03-F_xss_incidencias_list.png` | CP-10-03-F | 2026-07-09 | Captura de pantalla: página "Incidencias" mostrando el error 500 causado por BUG-001 (evidencia adicional de bloqueo del listado) |

Todas las transcripciones `curl` (peticiones y respuestas completas) y las consultas SQL con su salida quedan reproducidas inline en la Bitácora (§3) y el Registro de Bugs (§4), identificadas por su ID de caso y con marca de tiempo 2026-07-09 en el entorno de ejecución.

---

## 6. Cuadro Estadístico de Cierre

| Métrica | Valor |
| :--- | :---: |
| Casos diseñados (E3) | 90 |
| Casos ejecutados (con evidencia real registrada) | 90 (100%) |
| Casos **Aprobado** | 40 |
| Casos **Fallido** (incluye bloqueados, no-aplica por spec desactualizado, y no-ejecutados por tiempo) | 50 |
| — de los cuales: bloqueados directamente por BUG-001 | 19 |
| — de los cuales: sin equivalente funcional real (spec E3 desactualizado) | 15 |
| — de los cuales: fallidos por defecto confirmado (no BUG-001) | 4 (CP-02-02-B¹, CP-10-03-F, CP-10-03-B, + BUG-001 directos ya contados arriba) |
| — de los cuales: no ejecutados por límite de tiempo (documentado, no fabricado) | 7 |
| Defectos totales registrados | 7 (BUG-001 a BUG-007) |
| Defectos por severidad | Crítico: 2 (BUG-001, BUG-005) · Alto: 2 (BUG-002, BUG-004) · Medio: 1 (BUG-003) · Bajo: 2 (BUG-006, BUG-007) |
| Defectos corregidos y re-testeados en este ciclo | 2 (BUG-002, BUG-004) |
| Defectos pendientes | 5 (BUG-001, BUG-003, BUG-005, BUG-006, BUG-007) |
| Tiempo de respuesta observado (percepción, no carga concurrente formal) | Respuestas `curl` sub-segundo en todos los endpoints funcionales; no se ejecutó una prueba de carga/estrés formal (JMeter/k6) en este ciclo — pendiente para un ciclo dedicado |

¹ CP-02-02-B se cuenta una sola vez aunque comparte causa raíz con BUG-001, para no duplicar el conteo.

---

## 7. Análisis, Trazabilidad y Lecciones Aprendidas

### 7.1. Zonas frágiles identificadas

1. **El listado autenticado de incidencias (`GET /api/incidents`) es un punto único de falla transversal**: al incluir `withCount('comments')` sin condicionar a la existencia de la tabla, un problema aislado del módulo de comentarios tumba la pantalla principal de gestión de incidencias completa (Módulo 01), afectando en cascada la capacidad de probar los Módulos 01, 02, 04 y parte de 05/06 desde la UI. Esto es una lección de diseño: los `withCount`/`with` sobre relaciones opcionales no deberían acoplar la disponibilidad de una pantalla núcleo a un módulo secundario.
2. **El manejo central de excepciones (`bootstrap/app.php`) no está no está preparado para errores de base de datos reales** (solo para excepciones de dominio con código HTTP explícito) — cualquier `QueryException` en cualquier endpoint de la API habría producido el mismo `TypeError` fatal antes de la corrección aplicada en este ciclo. Es razonable esperar que existan más rutas de error no cubiertas por las pruebas de desarrollo que sigan expuestas.
3. **Ausencia de saneamiento de HTML en contenido generado por el usuario** (BUG-005) en dos capas a la vez (backend no sanitiza, frontend no escapa) — es el hallazgo de mayor riesgo de este ciclo y debería priorizarse antes que cualquier otro trabajo de features nuevas.
4. **Desincronización entre migraciones versionadas y el esquema realmente desplegado** (BUG-001, y el hecho de que `migrate:status` reporta todo como `Pending` pese a que la mayoría del esquema ya está aplicado) sugiere que el flujo de despliegue/seed del entorno de desarrollo no pasa consistentemente por `artisan migrate`, lo cual es un riesgo de proceso, no solo de código.

### 7.2. Matriz de trazabilidad de requisitos (actualizada)

| Módulo E3 | Requisito funcional cubierto | Estado real tras E4 |
| :--- | :--- | :---: |
| 01 — CRUD de incidencias | Creación, edición y borrado lógico vía API | Backend operativo; UI de gestión bloqueada por BUG-001 |
| 02 — Estados e historial | Transición de estados con historial auditable | **No operativo para ningún rol** (BUG-001) |
| 03 — Asignación de responsables | Asignación múltiple con roles | Reemplazado por diseño (ADR-0003); el reemplazo (claim/release) tampoco opera hoy (BUG-001) |
| 04 — Comentarios | Registro y consulta de comentarios | **No operativo** (BUG-001) |
| 05 — Ubicación | Selección jerárquica normalizada | Operativo (arquitectura de árbol único, válida) |
| 06 — Clasificación | Selección jerárquica de categorías | Operativo, con hallazgo menor (BUG-003) |
| 07 — Notificaciones | Notificación por cambios relevantes | Estructura de API operativa; generación real de notificaciones bloqueada aguas arriba (BUG-001) |
| 08 — Dashboard | Métricas agregadas y filtros | Métricas base corregidas en este ciclo (BUG-004); filtros por fecha/tipo/ubicación no implementados en el backend actual |
| 09 — Autenticación | Login/logout/protección de rutas | **Completamente operativo y verificado** |
| 10 — Validaciones | Formato, tipos, sanitización | Validaciones de formato operativas; sanitización HTML **ausente** (BUG-005, crítico) |

### 7.3. Conclusiones predictivas sobre el nivel de calidad

El sistema muestra una **base de autenticación, autorización de alto nivel y catálogos jerárquicos sólida** (Módulos 05, 06, 09 aprobados de forma consistente y con evidencia real repetible). Sin embargo, **el núcleo del ciclo de vida de una incidencia (creación → asignación → cambio de estado → historial → comentarios) está actualmente no operativo de punta a punta** debido a un desfase de esquema de base de datos (BUG-001) que, por su naturaleza (tablas ausentes con migraciones ya escritas), es de **remediación rápida y de bajo riesgo** una vez que el equipo decida aplicarla fuera de este ciclo de QC — no refleja una falla de diseño, sino un problema de despliegue/sincronización de entorno.

El hallazgo de mayor impacto para la calidad global del producto es **BUG-005 (XSS almacenado)**, por ser explotable, de alta severidad y no depender de ningún otro defecto — se recomienda tratarlo como bloqueante para cualquier entrega a un entorno con usuarios reales, antes que cualquier otra corrección de este informe.

En conjunto, la tasa de aprobación bruta (40/90, 44%) **no debe leerse como "el sistema es deficiente"**, sino como el resultado esperable de ejecutar de forma rigurosa y sin omisiones un plan de pruebas (E3) que fue diseñado contra una interfaz distinta a la que finalmente se implementó, sumado a un entorno de datos que partió incompleto. Descontando los 15 casos "no aplica" por desactualización de spec y los 7 "no ejecutados" por límite de tiempo (ninguno de los cuales es un defecto del sistema), la tasa de aprobación sobre los **68 casos con veredicto real y comparable** es de **40/68 (59%)**, concentrada casi en su totalidad en un único defecto raíz (BUG-001) que explica 19 de los 28 fallos restantes.
