# CQRS Lite — Backend de Incidencias

| | |
|--|--|
| **Estado** | Vigente |
| **Versión** | 1.0 |
| **Scope**  | Backend Laravel (`backend/app/Domains/Incidents/*`) |
| **Audiencia** | Desarrolladores nuevos en el módulo de Incidents |

## Contexto

El módulo de Incidencias tiene dos perfiles de carga asimétricos:

- **Write side** (operadores, admins, scripts internos): volumen bajo, latencia no crítica, requiere invariantes fuertes (transacciones, auditoría, locks).
- **Read side** (ciudadanos en el mapa público): volumen alto, latencia crítica, tolerante a datos eventualmente consistentes mientras el mapa no quede en blanco.

El objetivo es optimizar cada lado por separado, pero **sin pagar el costo** de un CQRS completo (dos bases, buses, event sourcing). La fuente de verdad sigue siendo Postgres; el read model vive en Redis y se mantiene por proyección.

## Decisión

Adoptamos un patrón **CQRS lite** dentro del módulo `Incidents`:

- El aggregate root es compartido: `App\Domains\Incidents\Models\Incident`.
- **Command side** escribe en Postgres dentro de `DB::transaction()`, con `lockForUpdate()` cuando hay race, y bind del actor de auditoría vía `set_config('app.current_user_id', ...)`.
- **Query side** NO consulta Postgres. Lee de un **read model desnormalizado en Redis** (hash `feed:v2:items` + sorted set `feed:v2:index`).
- La sincronización entre ambos lados es **eventual**: un listener Eloquent (`RedisIncidentSync`) escucha `created` / `updated` / `deleted` y reescribe el read model.

## Mapa de archivos

### Command side (escrituras → Postgres)

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| HTTP shell | `backend/app/Domains/Incidents/Http/IncidentController.php` | CRUD: `index` (admin), `show`, `store`, `update`, `updateStatus` |
| HTTP shell | `backend/app/Domains/Incidents/Http/Controllers/AssignmentController.php` | Asignaciones de operadores |
| Validación | `backend/app/Domains/Incidents/Http/Requests/*` | FormRequests |
| Reglas de negocio | `backend/app/Domains/Incidents/Services/AssignmentService.php` | Guardas de asignación (rol válido, sin duplicados, un solo responsable) |
| Reglas de negocio | `backend/app/Domains/Incidents/Services/IncidentClaimService.php` | Guardas de claim/release + límite `max_active_claims` |
| Repositorio | `backend/app/Domains/Incidents/Repositories/EloquentIncidentRepository.php` | `update()` en transacción, `claim()` / `release()` con `lockForUpdate()`, bind de actor de auditoría |
| Contrato | `backend/app/Domains/Incidents/Repositories/IncidentRepository.php` | Interface del repositorio |
| Aggregate root | `backend/app/Domains/Incidents/Models/Incident.php` | Modelo compartido por ambos lados |

### Query side (lecturas → Redis)

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| HTTP shell | `backend/app/Domains/Incidents/Http/FeedController.php` | `__invoke` — único entry point del feed ciudadano |
| Read model | `backend/app/Domains/Incidents/Models/FeedService.php` | `getFeed(...)` — lee de Redis, degrada a respuesta vacía si Redis cae |

### Proyección (write → read)

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Listener | `backend/app/Domains/Incidents/Listeners/RedisIncidentSync.php` | Escucha eventos Eloquent y mantiene `feed:v2:items` / `feed:v2:index` sincronizados |

## Flujo end-to-end

```
1. Cliente (operador/admin) hace POST /api/incidents
2. IncidentController::store valida con StoreIncidentRequest
3. Incident::create(...) persiste en Postgres + dispara evento `created`
4. RedisIncidentSync escucha `created` → escribe en feed:v2:items + agrega a feed:v2:index
5. Cliente (ciudadano) hace GET /api/feed
6. FeedController::__invoke llama a FeedService::getFeed(...)
7. FeedService lee feed:v2:index (ZREVRANGE) + feed:v2:items (HGETALL)
8. Devuelve JSON paginado, sin tocar Postgres
```

La latencia del paso 5→8 es **Redis puro** (≈ 1–5 ms). Si Redis cae, `FeedService` loggea y devuelve `{ data: [], meta: {...} }`: el frontend debe estar preparado para mostrar un banner de "datos no disponibles".

## Reglas para agregar código nuevo

| Si vas a... | Ponelo en... | No en... |
|-------------|-------------|----------|
| Mutación que cambia estado de una Incidencia | `EloquentIncidentRepository` (si toca SQL/auditoría) o un nuevo `*Service` (si son reglas puras) | Controllers, Models |
| Nuevo caso de uso de escritura (ej. `archive`) | Nuevo método en `EloquentIncidentRepository` + método delgado en un Service | Read models |
| Nuevo filtro o campo al feed ciudadano | `FeedService::getFeed` (read model) | `EloquentIncidentRepository::applyFilters` |
| Nuevo listener de un evento | `app/Domains/Incidents/Listeners/` | Services |
| Endpoint de lectura que NO es feed | Si la latencia es crítica, crear un read model propio. Si no, va en `IncidentController::show` (lee de Postgres con eager loads acotados) | — |

## Trade-offs aceptados

- ✅ Latencia del feed ciudadano independiente de la carga de escritura.
- ✅ Caída de Redis no tira el mapa (degradación silenciosa a vacío + log).
- ✅ Write side mantiene invariantes fuertes con transacciones Postgres.
- ⚠️ **Consistencia eventual**: una Incidencia recién creada puede tardar milisegundos en aparecer en el feed. Si el ciudadano hace `POST` y luego `GET feed`, **no verá su propia incidencia** en la respuesta inmediata. Si esto se vuelve un problema hay dos caminos: (a) esperar al ack del listener en el `store`, (b) hidratar el feed con la respuesta del write.
- ⚠️ El read model sólo conoce Incidencias. Si necesitamos indexar Comentarios o Asignaciones en el feed, hay que extender `RedisIncidentSync` y `FeedService` **juntos**.
- ⚠️ Dos lugares para tocar al cambiar el shape de una Incidencia: el modelo `Incident` y la proyección en `RedisIncidentSync`.

## No-objetivos

Este NO es un CQRS completo. Explícitamente **NO**:

- Hay bus de Commands/Queries con handlers separados (estilo Spatie/Laravel-Bus por comando).
- Hay event sourcing (los eventos Eloquent son hooks de proyección, no el log canónico).
- Hay una segunda base de datos para lecturas (Redis es cache/proyección, no source of truth).
- Hay proyecciones asíncronas con queue workers (la sincronización ocurre dentro del mismo request HTTP que hizo el write).
- Hay un `IncidentReadModel` independiente del aggregate root (el read side usa una vista Redis serializada, no un modelo hidratado).

Si en el futuro alguno de estos se vuelve necesario (volumen, auditoría completa, read models ricos), este patrón es una **trinchera de salida** clara hacia full CQRS o Event Sourcing.

## Cómo verificar la coherencia en un PR

Antes de aprobar un cambio al módulo de Incidents, comprobá:

1. ¿La lógica de escritura pasa por un Service y/o Repository, no por el Controller directamente?
2. ¿Si toca Postgres, está envuelta en `DB::transaction` + `bindAuditActor()`?
3. ¿Si dispara un evento Eloquent, hay un listener que mantiene el read model en Redis consistente?
4. ¿El feed ciudadano se sirve SOLO desde `FeedService`? Cualquier `Incident::query()->...` dentro de `FeedController` o `FeedService` es una señal de alarma.
