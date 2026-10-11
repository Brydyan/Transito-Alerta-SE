# Proposal: Modular Monolith, Vertical Slices y Shared Contracts (@tase/contracts)

## Intent

Transformar la estructura del repositorio TASE en un monorepo modular coherente y tipado de extremo a extremo, implementando:
1. **Shared Contracts (`packages/contracts`)**: Un paquete TypeScript puro (`@tase/contracts`) que unifica enums, interfaces y DTOs entre backend (NestJS) y frontend (Angular), garantizando validación estricta en tiempo de compilación (`typecheck`).
2. **Backend Domain-Driven Modular Monolith**: Reorganización de los 24 módulos planos de `backend/src/modules/` en 4 Bounded Contexts canónicos (`incidents`, `iam`, `gis`, `comms`) junto a capas explícitas de `infra/` y `shared/`.
3. **Frontend Vertical Slice Architecture**: Reestructuración de `frontend/src/app/features/` en rodajas verticales autónomas (`data-access`, `ui`, `feature`, `utils`) y saneamiento de los 38 servicios planos de `core/services/`.
4. **Unified pnpm Workspace & Path Aliases**: Configuración centralizada de `pnpm-workspace.yaml` y resolución de rutas limpias en TypeScript (`@tase/contracts`, `@domains/*`, `@infra/*`, `@shared/*`), eliminando la fragilidad de imports relativos (`../../../../`).

**Shortcut**: Ticket único [sc-417](https://app.shortcut.com/upse/story/417) · Épica 192 «⚠️ GeoReporta» (workspace: `upse`) · Ver detalle en [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/infra/2026-10-10-modular-monolith-contracts-slices/shortcut-ticket.md)

---

## Contexto y Problema Actual

1. **Drift de Tipos entre Backend y Frontend (Sin Contrato Común)**:
   - Los contratos se definen por duplicado y de forma manual. Por ejemplo, `IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'` existe de forma idéntica e independiente en `backend/src/modules/incidents/entities/incident.entity.ts` y en `frontend/src/app/core/models/incident.model.ts`.
   - Si el backend renombra un estado o añade un campo en un DTO, el frontend no detecta el quiebre hasta que falla en tiempo de ejecución o en producción.

2. **Backend con 24 Módulos Planos Desacoplados de Dominio**:
   - `backend/src/modules/` contiene 24 carpetas al mismo nivel sin jerarquía de dominio: `assignments`, `audit`, `auth`, `comments`, `departments`, `geofencing`, `geo-zones`, `incident-categories`, `incidents`, `incident-social`, `invitations`, `mail`, `map`, `menus`, `notifications`, `operators`, `organizations`, `permissions`, `realtime`, `roles`, `sessions`, `status-history`, `telegram`, `users`.
   - No hay límites de contexto (Bounded Contexts) claros; la navegación es difusa y no es evidente qué módulos componen el flujo de incidencias vs. la identidad vs. la infraestructura geoespacial.

3. **Frontend con `core/services/` Sobrecargado (38 Servicios Mezclados)**:
   - `frontend/src/app/core/services/` almacena 38 servicios de naturaleza dispar: lógica de red de incidencias, filtros de feed, administración de roles, almacenamiento IndexedDB y utilidades de sesión.
   - Trabajar en una funcionalidad (e.g. `incidents`) obliga a saltar continuamente entre `core/services/`, `core/models/` y `features/incidents/`, violando el principio de alta cohesión y bajo acoplamiento.

4. **Ausencia de Workspace Unificado y Fragilidad de Imports Relativos**:
   - La raíz no posee un `pnpm-workspace.yaml` integrador. `backend/` y `frontend/` operan con workspaces desvinculados.
   - Ambos proyectos carecen de `compilerOptions.paths` en sus `tsconfig.json`, forzando rutas relativas profundas (`../../../../shared/authz/...`) altamente sensibles a refactorizaciones de carpetas.

---

## Solución Propuesta

### 1. Paquete Compartido `@tase/contracts` (`packages/contracts`)
- Ubicación: `packages/contracts/`.
- Contenido:
  - `src/enums/`: Estados de incidencias, prioridades, roles de usuario, tipos de tokens, acciones de auditoría.
  - `src/dtos/`: Modelos de respuesta de incidentes, paylods de creación, asignación, filtros y paginación.
  - `src/constants/`: Listas inmutables de estados permitidos y transiciones válidas.
- Cero dependencias pesadas: Solo TypeScript puro.
- Consumo en monorepo: Vía `workspace:*` en `package.json` de backend y frontend.

### 2. Backend: Bounded Contexts y Capas Limpias
Reestructuración interna de `backend/src/`:
- `domains/incidents/`: `incidents`, `assignments`, `comments`, `status-history`, `incident-categories`, `incident-social`.
- `domains/iam/`: `auth`, `users`, `roles`, `permissions`, `sessions`, `invitations`, `audit`.
- `domains/gis/`: `geo-zones`, `geofencing`, `map`.
- `domains/comms/`: `telegram`, `mail`, `realtime`, `notifications`.
- `infra/`: Adaptadores de base de datos (TypeORM), Redis (Streams, Cache), Almacenamiento (MinIO S3), Sentry.
- `shared/`: Guards RBAC (`PermissionGuard`, `EmailVerifiedGuard`), lógica de alcance (`resolveSubjectScope`), decorators, criptografía y utilitarios transversales.

### 3. Frontend: Vertical Slice Architecture
Reestructuración interna de `frontend/src/app/features/` bajo el patrón Vertical Slice:
- Cada feature agrupa sus 4 responsabilidades:
  - `data-access/`: Servicios HTTP de la feature, gestión de estado reactivo mediante Signals.
  - `ui/`: Componentes de presentación puros (tarjetas, badges, modales, tablas).
  - `feature/`: Componentes inteligentes y controladores de ruta (páginas principales, formularios).
  - `utils/`: Mapeadores, validadores y máquinas de estado locales.
- `core/` queda purificado: Exclusivamente infraestructura del navegador (interceptores HTTP, autenticación JWT, Dexie / IndexedDB base, guards de routing global).

### 4. Workspace pnpm y Path Aliases
- Archivo raíz `pnpm-workspace.yaml` declarando `backend`, `frontend` y `packages/*`.
- Configuración de aliases en `backend/tsconfig.json`:
  - `@tase/contracts`: `["../packages/contracts/src"]`
  - `@domains/*`: `["src/domains/*"]`
  - `@infra/*`: `["src/infra/*"]`
  - `@shared/*`: `["src/shared/*"]`
- Configuración de aliases en `frontend/tsconfig.json`:
  - `@tase/contracts`: `["../packages/contracts/src"]`
  - `@core/*`: `["src/app/core/*"]`
  - `@features/*`: `["src/app/features/*"]`
  - `@shared/*`: `["src/app/shared/*"]`

---

## Restricciones y Compatibilidad (Do No Harm)

- **Cero Cambios en Base de Datos**: No se crean ni modifican migraciones SQL. Las tablas, columnas y tipos de PostgreSQL permanecen idénticos.
- **Cero Cambios en Contratos de Wire**: Los endpoints HTTP, métodos REST, códigos de estado y nombres JSON en snake_case se mantienen exactamente iguales.
- **Cero Impacto en Infraestructura de Producción/Staging**: `compose.yaml` sigue construyendo las imágenes con Dockerfile; el contexto de build en la raíz del repositorio ya soporta la inclusión de `packages/`.
- **Evolución Gradual y Fases Atómicas**: El plan de migración se ejecuta por capas sin romper los tests unitarios (`pnpm test`) ni los builds (`pnpm run build`).

---

## Áreas Afectadas

- **Raíz del Monorepo**:
  - `pnpm-workspace.yaml` (nuevo)
  - `package.json` (actualización de scripts raíz)
  - `packages/contracts/` (nuevo paquete)
- **Backend (`backend/`)**:
  - `backend/package.json` (dependencia `@tase/contracts`)
  - `backend/tsconfig.json` (paths aliases)
  - `backend/src/` (reorganización de `modules/` hacia `domains/`, `infra/`, `shared/`)
  - `backend/Dockerfile` (inclusión de `packages/contracts` en build)
- **Frontend (`frontend/`)**:
  - `frontend/package.json` (dependencia `@tase/contracts`)
  - `frontend/tsconfig.json` (paths aliases)
  - `frontend/src/app/` (reorganización de `features/` en rodajas verticales y migración de servicios de `core/services/`)
