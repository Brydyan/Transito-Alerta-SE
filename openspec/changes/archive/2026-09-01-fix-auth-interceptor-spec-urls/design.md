# Diseño: alinear `auth.interceptor.spec.ts` con las rutas reales

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`

---

## D1 — Se elimina `/v1` del spec; **no** se añade versionado al backend

**Decisión**: el spec se corrige para usar `/api/…`, que es lo que el sistema expone hoy.

**Evidencia**:

| Comprobación | Resultado |
|---|---|
| `setGlobalPrefix` en `backend/src/main.ts:30` | `'api'` — sin segmento de versión |
| `enableVersioning` en `backend/src` | **grep en cero** |
| `apiUrl` en `frontend/src/environments/*.ts` | `'/api'` |
| Apariciones de `api/v1` en código de producción | **cero** — sólo en el spec |

**Alternativa rechazada — introducir versionado real** (`app.enableVersioning({ type:
VersioningType.URI, defaultVersion: '1' })` + `apiUrl: '/api/v1'`):

Rechazada por tres motivos.

1. **Desproporción.** Un test desalineado se resolvería reescribiendo el direccionamiento
   de los 20 módulos del backend, la configuración del frontend y el proxy inverso de
   staging. La causa no lo justifica.
2. **No hay demanda.** El versionado sirve para sostener dos contratos a la vez durante
   una migración de clientes. Este sistema tiene **un** cliente, en el mismo repositorio,
   desplegado a la vez. Nada consume una v1 hoy.
3. **Dirección de la corrección.** El código de producción es correcto en ambos lados y
   está de acuerdo consigo mismo; el único artefacto discrepante es el test. Cambiar el
   sistema para satisfacer un test equivocado es exactamente la inversión que el proyecto
   ya pagó con SC-209.

Si el versionado hiciera falta más adelante, es un change propio con su propia
propuesta: toca despliegue, proxy y compatibilidad hacia atrás. No entra por la puerta
de una corrección de test.

**Origen del error**, para que no vuelva: `docs/tasks/0-OVERVIEW.md:92` planificó
*«reconfigurar todas las llamadas de API a rutas NestJS `/api/v1/`»*. Se implementó el
prefijo `api` y se descartó el `v1`, pero el spec se había escrito contra el plan.
`docs/agents/minimax-builder.md` ya marca `docs/tasks/` como borrador viejo que no debe
usarse como fuente.

---

## D2 — Las URLs de conducción también se corrigen, no sólo las dos que fallan

**Decisión**: se reemplazan las **11** apariciones de `/api/v1/`, no sólo las 2 que
rompen la suite.

**Motivo**: tres de los cinco tests pasan hoy porque emiten y esperan el mismo literal
inventado:

```ts
http.get('/api/v1/incidents').subscribe();
const req = backend.expectOne('/api/v1/incidents');   // cierra sobre sí mismo
```

Ese par pasa con cualquier string. Verde sin significado. Sólo E3.3 y E3.4 fallan porque
la petición de refresh la emite `AuthService` con la ruta real — el único punto donde el
test roza código de producción.

Arreglar sólo las dos que fallan deja tres tests midiendo ficción y un archivo que
afirma dos direccionamientos incompatibles a la vez.

`/api/incidents` es ruta real, verificada:
`backend/src/modules/incidents/incidents.controller.ts:49` → `@Controller('incidents')`.

**Alternativa rechazada — tocar sólo las 2 líneas que fallan**: es el cambio mínimo para
poner el CI en verde, y por eso mismo es el que deja la trampa armada. El siguiente que
lea el archivo asume que `/api/v1` es el contrato.

---

## D3 — No se abstrae la base de la URL a una constante compartida

**Decisión**: los tests siguen usando literales `/api/…` escritos a mano.

**Alternativa rechazada — importar `environment.apiUrl` en el spec**: acopla el test a la
misma configuración que ejercita. Si alguien cambia `apiUrl` por error, el test se mueve
con él y no detecta nada. El literal escrito a mano es la forma de que el test tenga una
opinión independiente sobre el contrato.

Es el mismo principio que hizo fallar E3.3 de forma útil: el literal ficticio chocó con
la realidad y **eso es lo que se quiere** que ocurra cuando cambia una ruta. Lo que
estaba mal era el valor del literal, no la técnica.

---

## Contrato verificado

```
setGlobalPrefix('api')  +  @Controller('auth')       →  /api/auth/*
setGlobalPrefix('api')  +  @Controller('incidents')  →  /api/incidents
```

| Endpoint en el spec | Antes | Después |
|---|---|---|
| Recurso de conducción | `/api/v1/incidents` | `/api/incidents` |
| Refresco de sesión | `/api/v1/auth/refresh` | `/api/auth/refresh` |
| Sesión actual | `/api/v1/auth/me` | `/api/auth/me` |
| Inicio de sesión | `/api/v1/auth/login` | `/api/auth/login` |

Las aserciones de cuerpo y cabecera que ya existen (`refresh_token` en snake_case,
`Authorization: Bearer`) **no se tocan**: son correctas y son la parte del test que sí
verifica el contrato real.
