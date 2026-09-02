# Spec: sesión y refresco de token — direccionamiento del spec del interceptor

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`
**Capability**: `auth-session`

---

## Requirement: las pruebas del interceptor afirman contra rutas reales del backend

La suite de `auth.interceptor.spec.ts` DEBE dirigirse a rutas que el backend expone de
verdad. Una URL inventada en un test es un contrato no verificado: si el test emite y
espera el mismo literal, pasa con cualquier valor y no prueba nada.

La ruta real se compone de `setGlobalPrefix('api')` (`backend/src/main.ts:30`) más el
argumento del `@Controller` correspondiente. **No hay segmento de versión** — no existe
`enableVersioning` en el backend.

### Scenario: refresco tras 401 en una llamada normal

- **GIVEN** una sesión con `accessToken` y `refreshToken` presentes
- **WHEN** una petición a `/api/incidents` responde 401
- **THEN** el interceptor emite `POST /api/auth/refresh`
- **AND** el cuerpo es `{ refresh_token: 'rt-1' }` en snake_case
- **AND** la petición original se reintenta contra `/api/incidents` con el token nuevo

### Scenario: un 401 del propio endpoint de refresco no recursa

- **GIVEN** una sesión con `refreshToken` presente
- **WHEN** `POST /api/auth/refresh` responde 401
- **THEN** el error se propaga al llamador
- **AND** no se emite una segunda petición de refresco

### Scenario: un 401 del inicio de sesión no dispara refresco

- **GIVEN** ninguna sesión activa
- **WHEN** `POST /api/auth/login` responde 401
- **THEN** el error se propaga al llamador
- **AND** no se emite ninguna petición a `/auth/refresh`

### Scenario: ninguna URL de prueba contiene un segmento de versión

- **GIVEN** el archivo `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- **WHEN** se busca la cadena `/api/v1`
- **THEN** no hay coincidencias
- **AND** toda URL del archivo se corresponde con un `@Controller` existente del backend

---

## Requirement: el direccionamiento de producción no se modifica

Este change NO DEBE alterar el comportamiento de la aplicación. El código de producción
ya es correcto y coherente consigo mismo en ambos lados.

### Scenario: el interceptor y el servicio quedan intactos

- **GIVEN** el diff de este change
- **WHEN** se listan los archivos tocados
- **THEN** el único archivo modificado bajo `frontend/src/` es
  `core/interceptors/auth.interceptor.spec.ts`
- **AND** no hay cambios en `auth.interceptor.ts`, `auth.service.ts` ni en
  `environments/*.ts`
- **AND** no hay cambios bajo `backend/`

### Scenario: la suite completa queda en verde

- **GIVEN** el change aplicado
- **WHEN** se ejecuta `pnpm test` desde `frontend/`
- **THEN** los 102 tests pasan
- **AND** `pnpm build` sigue en verde
