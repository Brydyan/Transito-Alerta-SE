# Specification: Modular Monolith, Vertical Slices y Shared Contracts

## Requirements (EARS)

### R1 — Paquete de Contratos Compartidos (`@tase/contracts`)
- **Ubicuo**: El monorepo DEBE mantener un paquete TypeScript puro denominado `@tase/contracts` en `packages/contracts/` como la única fuente de verdad para tipos, enums y esquemas de payload comunes entre backend y frontend.
- **Ubicuo**: `@tase/contracts` NO DEBE depender de librerías de runtime específicas de backend o frontend (cero dependencias de `@nestjs/*`, `typeorm`, `@angular/*`, o APIs exclusivas del navegador/Node).
- **Evento**: CUANDO se añade o modifica un estado del ciclo de vida de incidencias, el cambio DEBE realizarse exclusivamente en `@tase/contracts`.

### R2 — Garantía de Integridad en Tiempo de Compilación (Type Safety Gate)
- **Evento**: CUANDO se ejecuta `pnpm run typecheck` o `pnpm run build` en el frontend, el compilador DEBE resolver los tipos de `@tase/contracts` de forma estricta.
- **No deseado**: SI un cambio en un enum o DTO de `@tase/contracts` no ha sido adaptado en el código consumidor (backend o frontend), ENTONCES el comando `pnpm run typecheck` DEBE fallar inmediatamente con un error de tipado TypeScript (`TS2322` o equivalente), impidiendo la generación de binarios o despliegues.

### R3 — Encapsulación y Bounded Contexts en Backend
- **Ubicuo**: El código del backend DEBE estructurarse dentro de `backend/src/domains/` agrupando módulos en los 4 Bounded Contexts canónicos: `incidents`, `iam`, `gis` y `comms`.
- **Invariante**: Módulos que pertenecen a un dominio NO DEBEN realizar importaciones directas de archivos internos de otro dominio; cualquier interacción inter-dominio DEBE realizarse a través de la interfaz pública del módulo (exportado por su `*.module.ts`) o mediante eventos del sistema (`EventEmitter` / Redis Streams).
- **Ubicuo**: Toda infraestructura externa (TypeORM, Redis, S3/MinIO) DEBE residir dentro de `backend/src/infra/`, y toda lógica transversal de autorización, guards y criptografía DEBE residir en `backend/src/shared/`.

### R4 — Cohesión Vertical y Purificación del Core en Frontend
- **Ubicuo**: Cada funcionalidad de negocio en `frontend/src/app/features/` DEBE organizarse como una rodaja vertical con estructura cuatripartita: `data-access/`, `ui/`, `feature/`, `utils/`.
- **Invariante**: La carpeta `frontend/src/app/core/` DEBE limitarse a servicios transversales de infraestructura de navegador (interceptor JWT, cliente base IndexedDB, guards globales de autenticación). Ningún servicio de dominio particular (e.g. `IncidentService`, `RolesService`) DEBE residir en `core/services/`.
- **Ubicuo**: Los servicios de dominio DEBEN residir exclusivamente en la carpeta `data-access/` de su respectiva rodaja vertical.

### R5 — Resolución de Rutas vía Path Aliases
- **Ubicuo**: Las configuraciones de TypeScript en backend (`backend/tsconfig.json`) y frontend (`frontend/tsconfig.json`) DEBEN resolver `@tase/contracts` y las capas principales (`@domains/*`, `@infra/*`, `@shared/*` en backend; `@core/*`, `@features/*`, `@shared/*` en frontend) mediante `compilerOptions.paths`.
- **No deseado**: Ningún archivo nuevo o refactorizado DEBE utilizar rutas relativas con tres o más saltos ascendentes (`../../../*`).

### R6 — Reproducibilidad en Monorepo y Docker
- **Ubicuo**: La raíz del monorepo DEBE declarar un `pnpm-workspace.yaml` que vincule `backend`, `frontend` y `packages/*`.
- **Evento**: CUANDO se ejecuta el build de Docker (`docker compose build backend` o staging), el build DEBE incluir el directorio `packages/contracts/` en el contexto y resolver exitosamente todas las dependencias del workspace con `pnpm install --frozen-lockfile`.

---

## Scenarios

### Escenario 1: Fuente única de verdad para estados de incidencias
- **DADO** el paquete `@tase/contracts` exportando el tipo `IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'`
- **CUANDO** el backend declara su entidad y el frontend declara su componente de detalle
- **ENTONCES** ambos importan `import { IncidentStatus } from '@tase/contracts'`
- **Y** no existe ninguna definición duplicada de `IncidentStatus` en `incident.entity.ts` ni en `incident.model.ts`

### Escenario 2: Detección de incompatibilidad de tipos en frontend (Typecheck Gate)
- **DADO** un nuevo estado `'archived'` añadido al tipo `IncidentStatus` en `@tase/contracts`
- **Y** un mapa exhaustivo `Record<IncidentStatus, string>` en el frontend que no implementa la clave `'archived'`
- **CUANDO** se ejecuta `pnpm run typecheck` en el frontend
- **ENTONCES** el compilador falla con `Type '{ ... }' is not assignable to type 'Record<IncidentStatus, string>'`
- **Y** el pipeline de CI bloquea el despliegue antes de tocar producción

### Escenario 3: Encapsulación entre Bounded Contexts en Backend
- **DADO** el dominio `domains/incidents/` y el dominio `domains/iam/`
- **CUANDO** el servicio de incidentes necesita verificar un usuario
- **ENTONCES** utiliza la inyección de dependencias a través del módulo exportado de IAM o eventos de dominio
- **Y** no realiza ningún import relativo a rutas privadas internas de IAM como `../../iam/auth/internal-hasher`

### Escenario 4: Aislamiento de Feature Vertical en Frontend
- **DADO** la rodaja vertical `features/incidents/`
- **CUANDO** un desarrollador requiere modificar el servicio de incidencias o la gestión de su estado
- **ENTONCES** todos los artefactos requeridos residen dentro de `features/incidents/data-access/`
- **Y** no se requiere modificar archivos en `app/core/services/` ni en otras rodajas independientes

### Escenario 5: Build de contenedor Docker en Monorepo
- **DADO** el archivo `compose.yaml` y `backend/Dockerfile`
- **CUANDO** se ejecuta `docker compose --profile staging build backend` con el contexto en la raíz del repositorio
- **ENTONCES** el stage `deps` copia `pnpm-workspace.yaml`, `packages/contracts` y `backend/package.json`
- **Y** el comando `pnpm run build` en el contenedor compila sin errores TS2307 de módulos no encontrados
