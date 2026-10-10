# Technical Design: Modular Monolith, Vertical Slices y Shared Contracts

## Architecture Decisions (D1..Dn)

### D1 — Paquete Compartido TypeScript Puro (`packages/contracts`)
- **Decisión**: Crear `packages/contracts/` con TypeScript puro (sin runtime ni dependencias pesadas), exportando tipos, enums y DTOs de wire canónicos.
- **Alternativa Rechazada**: Generación automática de tipos cliente mediante OpenAPI / Swagger Codegen (`openapi-generator` / `swagger-typescript-api`).
- **Motivo del Rechazo**: El backend de TASE utiliza `SnakeCaseResponseInterceptor` en tiempo de ejecución, lo que genera discrepancias frecuentes entre los DTOs de NestJS y el payload real emitido. Los generadores de código OpenAPI agregan fricción de build, requieren levantar el servidor o ejecutar scripts pesados de introspección, y no capturan tipos de unión de constantes con la misma fluidez que TypeScript directo. Un paquete puro ofrece verificación instantánea en milisegundos en el IDE y en `tsc`.

---

### D2 — Resolución Directa vía Workspace y Path Aliases
- **Decisión**: Consumir `@tase/contracts` usando la sintaxis `"@tase/contracts": "workspace:*"` en los `package.json` de backend y frontend, y mapear `paths` en `tsconfig.json` hacia `packages/contracts/src`.
- **Alternativa Rechazada**: Publicar `@tase/contracts` en un registro de paquetes privado (Verdaccio o npmjs).
- **Motivo del Rechazo**: Añade latencia de red, necesidad de tokens de acceso, versiones semánticas intermedias y desincronización durante el desarrollo activo. Al usar resolución directa en el monorepo, cualquier cambio en un tipo en `packages/contracts/` se refleja inmediatamente en backend y frontend sin pasos intermedios de publicación.

---

### D3 — Bounded Contexts en Backend (Monolito Modular)
- **Decisión**: Agrupar los 24 módulos planos en 4 Bounded Contexts en `backend/src/domains/`:
  1. `incidents`: Core de incidencias (`incidents`, `assignments`, `comments`, `status-history`, `incident-categories`, `incident-social`).
  2. `iam`: Identidad, permisos y accesos (`auth`, `users`, `roles`, `permissions`, `sessions`, `invitations`, `audit`).
  3. `gis`: Inteligencia espacial (`geo-zones`, `geofencing`, `map`).
  4. `comms`: Notificaciones y comunicación (`telegram`, `mail`, `realtime`, `notifications`).
  Capas de soporte:
  - `backend/src/infra/`: Adaptadores externos (TypeORM config, Redis Streams/Cache, MinIO S3 client, Sentry).
  - `backend/src/shared/`: Lógica transversal pura (Guards RBAC, decorators, `resolveSubjectScope`, crypto, interceptors).
- **Alternativa Rechazada**: Desacoplar el sistema en microservicios independientes con repositorios o contenedores separados.
- **Motivo del Rechazo**: Sobreingeniería severa para la escala de TASE. Los microservicios introducen latencia de red, riesgo de consistencia eventual en base de datos (pérdida de transacciones ACID en Postgres), orquestación compleja con Docker Compose/Kubernetes y costos innecesarios. El Monolito Modular brinda límites de dominio estrictos y alta mantenibilidad sin el dolor operativo de sistemas distribuidos.

---

### D4 — Frontend Vertical Slice Architecture
- **Decisión**: Organizar cada funcionalidad dentro de `frontend/src/app/features/<feature>/` como una rodaja vertical autónoma dividida en 4 responsabilidades:
  - `data-access/`: Servicios HTTP de la feature y estado reactivo (Signals / RxJS).
  - `ui/`: Componentes de presentación puros ("tontos"), badges, tablas, modales.
  - `feature/`: Componentes inteligentes ("smart") y páginas asociadas a rutas.
  - `utils/`: Mapeadores, validadores y transformadores locales.
  Depurar `core/`: Limitar `frontend/src/app/core/` exclusivamente a infraestructura de la plataforma web (interceptor de autenticación, cliente Dexie/IndexedDB base, guards de routing global).
- **Alternativa Rechazada**: Mantener la arquitectura tradicional por capas técnicas horizontales (`core/services/` masivo con 38 servicios y `core/models/`).
- **Motivo del Rechazo**: Viola el principio de alta cohesión. Una modificación en la vista de incidencias actualmente requiere saltar entre 4 directorios lejanos (`core/services/`, `core/models/`, `features/incidents/`, `shared/`). Si una funcionalidad debe ser modificada o retirada, el blast radius está desparramado por todo el proyecto.

---

### D5 — Fiel Reflejo del Formato de Red (Wire snake_case en Contratos)
- **Decisión**: Los contratos en `@tase/contracts/src/dtos/` declaran propiedades en `snake_case` exactamente como viajan por HTTP (`created_at`, `organization_id`, `department_id`, etc.).
- **Alternativa Rechazada**: Modelar los DTOs compartidos en `camelCase` e introducir una capa de serialización bidireccional en el cliente frontend.
- **Motivo del Rechazo**: `SnakeCaseResponseInterceptor` en NestJS transforma toda respuesta a `snake_case`. Si el contrato compartiera `camelCase`, el frontend creería tener tipos seguros pero recibiría propiedades no definidas en runtime (incidente registrado en ROADMAP: SC-209). El contrato compartido debe reflejar estrictamente la verdad del cable.

---

### D6 — Path Aliases Estandarizados en TypeScript
- **Decisión**: Configurar path aliases limpios en `tsconfig.json`:
  - **Backend**:
    - `@tase/contracts` → `["../packages/contracts/src"]`
    - `@domains/*` → `["src/domains/*"]`
    - `@infra/*` → `["src/infra/*"]`
    - `@shared/*` → `["src/shared/*"]`
  - **Frontend**:
    - `@tase/contracts` → `["../packages/contracts/src"]`
    - `@core/*` → `["src/app/core/*"]`
    - `@features/*` → `["src/app/features/*"]`
    - `@shared/*` → `["src/app/shared/*"]`
- **Alternativa Rechazada**: Mantener imports relativos estándar (`../../../../*`).
- **Motivo del Rechazo**: Los imports relativos profundos hacen que mover un archivo de carpeta rompa decenas de archivos adyacentes, aumentan la fricción de refactorización y vuelven ilegibles los encabezados de los archivos fuente.

---

### D7 — Adaptación Hermética de Docker en Monorepo
- **Decisión**: En `backend/Dockerfile` y `compose.yaml`:
  - El contexto de build ya es la raíz del repositorio (`.`).
  - En el stage `deps`, copiar `pnpm-workspace.yaml`, `packages/contracts/` y `backend/package.json`.
  - Instalar dependencias con `pnpm install --frozen-lockfile` resolviendo el paquete local `@tase/contracts`.
- **Alternativa Rechazada**: Requerir que el host compile previamente `packages/contracts` y ejecute `npm pack` o `pnpm link` antes de levantar Docker.
- **Motivo del Rechazo**: Rompe la reproducibilidad del entorno de desarrollo y CI. Si un desarrollador o el pipeline de GitHub Actions no corre el script previo, el contenedor falla con inconsistencias de entorno. La construcción dentro de Docker debe ser 100% autónoma.

---

## Estructura del Monorepo Post-Migración

```text
Transito-Alerta-SE/
├── packages/
│   └── contracts/                 # @tase/contracts (TS puro)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── enums/             # IncidentStatus, UserRole, etc.
│           ├── dtos/              # Interfaces de Request / Response
│           └── index.ts
│
├── backend/
│   ├── tsconfig.json              # Aliases: @domains/*, @infra/*, @shared/*, @tase/contracts
│   └── src/
│       ├── domains/
│       │   ├── incidents/         # incidents, assignments, comments, history...
│       │   ├── iam/               # auth, users, roles, sessions, audit...
│       │   ├── gis/               # geo-zones, geofencing, map
│       │   └── comms/             # telegram, mail, realtime, notifications
│       ├── infra/                 # TypeORM, Redis, S3/MinIO
│       └── shared/                # Guards, Authz, Decorators, Crypto
│
├── frontend/
│   ├── tsconfig.json              # Aliases: @core/*, @features/*, @shared/*, @tase/contracts
│   └── src/app/
│       ├── core/                  # Solo infraestructura web (JWT, Dexie, Interceptors)
│       ├── features/
│       │   ├── incidents/
│       │   │   ├── data-access/   # incident.service.ts, incident.signals.ts
│       │   │   ├── ui/            # incident-card, status-pill, modals
│       │   │   ├── feature/       # incident-list, incident-detail
│       │   │   └── utils/         # workflow.util.ts
│       │   └── ...
│       └── shared/                # UI components globales (buttons, toasts, dialogs)
│
├── pnpm-workspace.yaml            # Unificación de workspace raíz
├── compose.yaml
└── package.json
```
