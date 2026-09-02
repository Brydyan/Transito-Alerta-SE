# Propuesta: alinear `auth.interceptor.spec.ts` con las rutas reales del backend

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`
**Tipo**: corrección de test (sin cambio de comportamiento)
**Working dir**: `frontend`
**Prioridad**: **bloqueante** — el job `frontend` del CI está rojo, y con él el merge de F0 y de todas las fases siguientes

---

## Intención

`frontend/src/app/core/interceptors/auth.interceptor.spec.ts` afirma contra un prefijo
de API `/api/v1/` que **no existe en ninguna parte del sistema**. Dos de sus cinco tests
fallan de forma permanente. Este change alinea el spec con las rutas que el backend
expone realmente.

---

## Problema

### Síntoma

```
FAIL src/app/core/interceptors/auth.interceptor.spec.ts
  ● AuthInterceptor › on 401 from a regular call, refreshes and retries the original request
    Expected one matching request for criteria "Match URL: /api/v1/auth/refresh",
    found none. Requests received are: POST /api/auth/refresh.
  ● AuthInterceptor › does NOT retry on 401 from /auth/refresh (would loop forever)
    Expected one matching request for criteria "Match URL: /api/v1/auth/refresh",
    found none. Requests received are: POST /api/auth/refresh.

Tests: 2 failed, 100 passed, 102 total
```

### Causa raíz

La ruta real se compone así:

| Pieza | Valor | Fuente |
|---|---|---|
| Prefijo global | `api` | `backend/src/main.ts:30` — `app.setGlobalPrefix('api')` |
| Controlador | `auth` | `backend/src/modules/auth/auth.controller.ts:41` — `@Controller('auth')` |
| **Ruta efectiva** | **`/api/auth/refresh`** | |

Y el frontend la construye correctamente:

| Pieza | Valor | Fuente |
|---|---|---|
| Base | `/api` | `frontend/src/environments/environment.ts:3` — `apiUrl: '/api'` |
| Servicio | `/api/auth` | `frontend/src/app/core/services/auth.service.ts:49` |

**El código de producción está bien en ambos lados.** El único artefacto del repositorio
que menciona `/api/v1` es el propio spec — más `docs/tasks/0-OVERVIEW.md:92`, un
documento de planificación del arnés viejo que `docs/agents/minimax-builder.md` manda
ignorar explícitamente. El versionado se planificó y nunca se construyó: no hay
`enableVersioning` en el backend (grep en cero).

El test se escribió contra una API que no existe.

### Por qué fallan exactamente dos, y no cinco

Es la parte instructiva. Los cinco tests usan URLs `/api/v1/…`, pero:

- **E3.1, E3.2, E3.5 pasan** — el test emite la petición *y* la espera con el mismo
  literal inventado. `http.get('/api/v1/incidents')` +
  `expectOne('/api/v1/incidents')` cierra sobre sí mismo. No toca código de producción.
- **E3.3, E3.4 fallan** — la petición de refresh no la emite el test: la emite
  `AuthService`, que usa la ruta real. Ahí el literal ficticio choca con la realidad.

Un test sólo falla en el punto donde roza el código real. Los otros tres siguen verdes
midiendo ficción.

Esto es la trampa que `openspec/ROADMAP.md` ya registra: *«un test que afirma sobre la
URL construida en vez de sobre los campos mapeados no prueba nada — así se coló
SC-209»*. Acá el test afirma sobre URLs que él mismo inventó.

---

## Alcance

### Incluye

- Reemplazar las 11 apariciones de `/api/v1/` por `/api/` en
  `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- Sustituir el endpoint de conducción ficticio `/api/v1/incidents` por una ruta real
  del backend, para que el test ejercite la forma verdadera
- Documentar en el spec por qué las URLs no se inventan

### Excluye

- **Introducir versionado de API** (`enableVersioning`) — ver `design.md` D1
- Cambios en `auth.interceptor.ts`, `auth.service.ts`, `environment*.ts` o cualquier
  archivo bajo `backend/`. **Ninguno tiene defecto**
- Los demás specs del frontend. Si otros inventan URLs, van en un change aparte
- Cualquier cosa de F0 (`2026-08-29-f0-design-system-mock-alignment`)

---

## Migraciones de BD

Ninguna.

---

## Permisos RBAC

Ninguno. No se toca `roles.permissions` ni `users.permissions`, así que **no hay que
invalidar `perm:v3:uid:*`**.

---

## Dependencias de módulos

| Módulo | Relación |
|---|---|
| `core/interceptors/auth.interceptor.ts` | Bajo prueba — **no se modifica** |
| `core/services/auth.service.ts` | Emite la petición de refresh — **no se modifica** |
| `environments/environment.ts` | Origen de `apiUrl` — **no se modifica** |
| `backend/src/modules/auth` | Define la ruta real — **no se modifica** |

---

## Impacto

**Desbloquea el job `frontend` del CI.** Hoy el orden es
`install → test → build → lint` y `pnpm test` no lleva `continue-on-error`
([`.github/workflows/ci.yml:362`](../../../../.github/workflows/ci.yml)), así que las
dos fallas **cortan el job antes del build**. Cualquier PR que toque `frontend/` está
rojo, independientemente de su contenido.

Sin este change, F0 no mergea aunque se corrijan todos sus hallazgos, y F1-F6 nacen
bloqueadas.

---

## Riesgo

Bajo. Es un archivo de test, sin consumidores. El riesgo real sería el inverso —
«arreglar» el código de producción para que coincida con el test — y por eso `design.md`
deja la dirección de la corrección por escrito.
