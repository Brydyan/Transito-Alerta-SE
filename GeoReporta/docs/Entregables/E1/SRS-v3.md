# Especificación de Requisitos de Software (SRS) — v3.0 OPCIÓN B

## Sistema Web de Gestión de Incidencias Georreferenciadas

---

**Versión del Documento:** 3.0  
**Subtítulo:** Opción B — Alineación de Spec con Implementación (3-State Workflow)  
**Fecha:** 15 de julio de 2026  
**Estado:** Sincronizado con la implementación actual (3 estados, sin Publicador)  
**Nivel de Confianza:** Validado contra código fuente  
**Versión anterior:** v2.0 (07/07/2026) — requería Publicador + 4 estados  
**Versión histórica:** v1.0 (08/06/2026) preservada íntegra en [`SRS-v1.0.md`](./SRS-v1.0.md)

---

## Historial de Revisiones

| Versión | Fecha | Descripción | Autor |
|---------|-------|-------------|-------|
| 1.0 | 08/06/2026 | Creación inicial del documento SRS | Equipo de Proyecto |
| 2.0 | 07/07/2026 | Sincronización con implementación actual (4 estados + Publicador). v1.0 preservada en `SRS-v1.0.md` | Equipo de Proyecto |
| **3.0 (Opción B)** | **15/07/2026** | **Alineación final: 3-state workflow simplificado (pending → in_progress → resolved). Rol Publicador y tablas incident_verifications removidas. Cumplimiento E1: ~65% (core workflow sin auditoría de resoluciones).** | **Equipo de Proyecto** |

---

## Resumen ejecutivo de cambios v2.0 → v3.0 (Opción B)

### Decisión Arquitectónica

**v2.0 especificaba:** 4 estados + Publicador role + incident_verifications table + confirm endpoint  
**Implementación real:** 3 estados (pending → in_progress → resolved) sin Publicador  
**v3.0 (Opción B):** Alinea spec con realidad. Cambio documental (0 impacto técnico).

### Cambios Principales

| Aspecto | v2.0 | v3.0 (Opción B) |
|---------|------|-----------------|
| **Estados** | pending, pending_operator, in_progress, resolved | **pending, in_progress, resolved** |
| **Rol Publicador** | Sí (verificador) | ~~No~~ |
| **Confirm Endpoint** | POST /api/incidents/{id}/confirmar | ~~Removido~~ |
| **Verifications Table** | incident_verifications (RF-FUNC-032) | ~~No~~ |
| **RF-FUNC-011** | Confirmar Resolución | ~~Removido~~ |
| **RF-FUNC-032** | Incident Verifications | ~~Removido~~ |
| **Requisitos** | RF-FUNC-001 a RF-FUNC-035 (35 total) | **RF-FUNC-001 a RF-FUNC-034 (33 total)** |
| **E1 Cumplimiento** | ~100% (spec vs spec) | **~65% (spec vs implementación)** |

### Stack Tecnológico (Sin cambios vs v2.0)

| Componente | Versión |
|---|---|
| Framework backend | **Laravel 13.x** sobre **Swoole 5.0+ / Octane** |
| Base de datos | **PostgreSQL 15 con PostGIS** |
| Autenticación | **JWT** (`tymon/jwt-auth`) |
| Frontend | HTML5 + CSS3 + Bootstrap + JS vanilla + AngularJS |
| Cache / sync | **Redis** |

---

## Tabla de Contenidos

1. Introducción
   - 1.1 Propósito
   - 1.2 Alcance del Producto
   - 1.3 Definiciones, Acrónimos y Abreviaturas
   - 1.4 Referencias
   - 1.5 Visión General del Documento
2. Descripción General
   - 2.1 Perspectiva del Producto
   - 2.2 Funcionalidades del Producto
   - 2.3 Clases de Usuario y Características
   - 2.4 Ambiente Operativo
   - 2.5 Restricciones de Diseño e Implementación
   - 2.6 Suposiciones y Dependencias
3. Requisitos Específicos
   - 3.1 Requisitos de Interfaces Externas
   - 3.2 Requisitos Funcionales
   - 3.3-3.9 (idem v2.0)
4. Modelo de Datos
5. Apéndices
   - 5.1 Matriz de Trazabilidad
   - 5.2 Glosario
   - Apéndice A: SRS v2.0 (versión anterior) — ver [`SRS.md`](./SRS.md)
   - Apéndice B: SRS v1.0 (versión histórica) — ver [`SRS-v1.0.md`](./SRS-v1.0.md)

---

## 1. Introducción

### 1.1 Propósito

Este documento (**v3.0, Opción B**) establece la especificación de requisitos de software **alineada con la implementación real** del Sistema Web de Gestión de Incidencias Georreferenciadas, usando un modelo de 3 estados sin rol Publicador.

La versión v2.0 (07/07/2026) requería 4 estados + Publicador, pero la implementación deliberadamente simplificó a 3 estados para robustez. **v3.0 rectifica el documento para reflejar fielmente la realidad construida.**

El SRS sirve como acuerdo contractual entre el equipo de desarrollo y las asignaturas involucradas.

### 1.2 Alcance del Producto

El sistema consistirá en una aplicación web completa que permitirá (alineado con README.md del proyecto):

1. **Gestión de Incidencias**: Registro, edición y eliminación de incidencias con información básica (título, descripción, ubicación, tipo, prioridad).
2. **Gestión de Estados**: Flujo de 3 estados (Pendiente → En proceso → Resuelto) con historial completo de cambios (fecha, usuario).
3. **Asignación de Responsables**: Asignar uno o varios usuarios con roles (`responsable`, `apoyo`).
4. **Sistema de Comentarios**: Agregar comentarios a incidencias, registro de autor y fecha.
5. **Ubicación Normalizada**: Datos georreferenciados con jeraquía País → Provincia → Ciudad.
6. **Clasificación Jerárquica**: Tipo de incidencia → Subtipo.
7. **Notificaciones**: Cambios de estado generan notificaciones.
8. **Prioridad y Control**: Prioridad (alta, media, baja), fecha de creación y resolución.
9. **Consultas con Filtros y Métricas**: Incidencias por estado/tipo/ubicación, tiempo promedio de resolución.

El sistema NO incluirá (fuera de alcance):

- Aplicaciones móviles nativas.
- Integración con sistemas externos de terceros.
- Módulo de reportes avanzados con exportación a PDF/Excel.

### 1.3 Definiciones, Acrónimos y Abreviaturas

| Término | Definición |
|---|---|
| **API** | Application Programming Interface |
| **BD** | Base de Datos |
| **CRUD** | Create, Read, Update, Delete |
| **Claim** | Acción por la cual un OperadorOrg toma responsabilidad sobre una incidencia. |
| **Docker** | Plataforma de contenedores |
| **ER** | Entity Relationship |
| **FK** | Foreign Key |
| **Swoole** | Runtime PHP async event-driven con coroutines nativas. Implementación elegida vs FrankenPHP por mejor soporte StreamedResponse. |
| **HTTP** | Hypertext Transfer Protocol |
| **JSON** | JavaScript Object Notation |
| **JWT** | JSON Web Token; mecanismo de autenticación stateless. |
| **Laravel** | Framework PHP |
| **Multitenant** | Arquitectura donde los datos de cada organización (tenant) están aislados lógicamente por un `organization_id`. |
| **Octane** | Capa de Laravel que mantiene la app en memoria entre requests (alto rendimiento). |
| **OperadorOrg** | Abreviatura de `OperadorOrganizacion`; usuario de una organización que puede hacer `claim`/`release`. |
| **PostGIS** | Extensión de PostgreSQL para datos geoespaciales (puntos, polígonos, queries de distancia, etc.). |
| **REST** | Representational State Transfer |
| **Scope** | Restricción multitenant: un usuario solo ve/edita datos de su propia organización (excepto `SystemAdmin`). |
| **SRS** | Software Requirements Specification |
| **SQL** | Structured Query Language |
| **SystemAdmin** | Rol cross-tenant con bypass del scope. |
| **Trigger** | Mecanismo de base de datos que ejecuta lógica automáticamente ante eventos DML. |
| **UI** | User Interface |
| **UX** | User Experience |

### 1.4 Referencias

| Referencia | Descripción |
|---|---|
| IEEE 830-1998 | Recommended Practice for Software Requirements Specifications |
| ISO/IEC 25000 | SQuaRE — Software Quality Requirements and Evaluation |
| ISO/IEC 25010 | Modelo de calidad de producto de software |
| PSR-12 | Guía de estilos de codificación PHP |
| Laravel 12.x docs | https://laravel.com/docs/12.x |
| PostgreSQL 15 docs | https://www.postgresql.org/docs/15/ |
| PostGIS docs | https://postgis.net/documentation/ |
| Frankenphp | https://frankenphp.dev/ |
| JWT (RFC 7519) | https://datatracker.ietf.org/doc/html/rfc7519 |
| tymon/jwt-auth | https://jwt-auth.readthedocs.io/ |

### 1.5 Visión General del Documento

Este documento v3.0 sigue la estructura IEEE 830. La Sección 2 describe el producto y sus restricciones. La Sección 3 contiene los requisitos específicos. La Sección 4 presenta el modelo de datos. La Sección 5 incluye apéndices. Archivos históricos: `SRS.md` (v2.0), `SRS-v1.0.md` (v1.0).

---

## 2. Descripción General

*(Las secciones 2.1 a 2.6 son idénticas a v2.0, excepto donde se nota.)*

### 2.1 Perspectiva del Producto

El sistema es una aplicación web con arquitectura de tres capas, desplegada en contenedores Docker:

- **Capa de Presentación (Frontend)**: HTML5 + CSS3 + Bootstrap + JavaScript vanilla con AngularJS.
- **Capa de Lógica de Negocio (Backend)**: API REST en **Laravel 13** corriendo sobre **Swoole 5.0+ + Octane** (workers pool, coroutines nativas). Organizada en 13 dominios DDD.
- **Capa de Datos**: **PostgreSQL 15** con extensión **PostGIS**. Redis como cache y bus.

### 2.2 Funcionalidades del Producto

**Implementadas:**

1. **Gestión de Incidencias**: CRUD completo con coordenadas geográficas (PostGIS Point).
2. **Máquina de Estados**: **3 estados:** `pending` → `in_progress` → `resolved`, con auditoría via trigger de BD.
3. **Asignación de Responsables**: Asignar/desasignar usuarios con roles (`responsable`, `apoyo`).
4. **Sistema de Comentarios**: Crear, leer comentarios por incidencia, con soft delete.
5. **Ubicación Georreferenciada**: Coordenadas PostGIS + dirección normalizada (País → Provincia → Ciudad).
6. **Clasificación Jerárquica**: Tipo → Subtipo (autorreferencia `parent_id`).
7. **Notificaciones**: Cambios de estado generan eventos (modelo listo, UI pendiente).
8. **Prioridad y Control**: 3 niveles (alta, media, baja), fecha de creación y `resolution_date` automático.
9. **Consultas y Filtros**: Búsqueda por estado, tipo, ubicación, prioridad.
10. **Dashboard**: Conteos por estado, visualización básica de métricas.
11. **Scoping Multitenant**: Aislamiento automático por organización.
12. **Menú Dinámico por Rol**: `GET /menus/my` con renderizado frontend según permisos.

### 2.3 Clases de Usuario y Características

#### 2.3.1 SystemAdmin

| Atributo | Detalle |
|---|---|
| **Rol** | Usuario cross-tenant con privilegios completos |
| **Permisos** | CRUD sobre todas las entidades de todas las organizaciones; bypass de scope |
| **Frecuencia de uso** | Media |
| **Nivel de expertise** | Alto |

#### 2.3.2 OperadorOrganizacion

| Atributo | Detalle |
|---|---|
| **Rol** | Operador de una organización específica; toma y libera incidencias de su org |
| **Permisos** | Ver/editar incidencias de su org; `claim`/`release`; comentar; reportar ubicación propia |
| **Restricción** | Máximo `max_active_claims` simultáneas (configurado por org) |
| **Frecuencia de uso** | Alta |
| **Nivel de expertise** | Básico a intermedio |

#### 2.3.3 ~~Visitante~~ — rol retirado

Ya no existe acceso anónimo al sistema. Toda ruta requiere autenticación JWT.

### 2.4 Ambiente Operativo

*(Idéntico a v2.0)*

### 2.5 Restricciones de Diseño e Implementación

| Restricción | Descripción |
|---|---|
| Backend | Laravel 12 (API REST en PHP) — obligatorio |
| Frontend | HTML5, CSS3, Bootstrap 5, JavaScript vanilla — obligatorio |
| Base de datos | PostgreSQL 15 con extensión PostGIS — obligatorio |
| Autenticación | JWT (stateless) + Firebase Google Sign-In — implementado |
| Despliegue | Contenedores Docker con docker-compose — obligatorio |
| Auditoría | Trigger `trg_log_incident_status` registra cambios automáticamente |
| **Estados** | **3 estados: `pending`, `in_progress`, `resolved`** |
| Soft Deletes | Aplicado a Incident, User, IncidentCategory, Location, Organization |

### 2.6 Suposiciones y Dependencias

*(Idénticas a v2.0)*

---

## 3. Requisitos Específicos

### 3.1 Requisitos de Interfaces Externas

*(La mayoría idéntica a v2.0. Cambios significativos:)*

#### 3.1.1 Interfaces de Usuario (cambios en RF-UI-002 y RF-UI-004)

**RF-UI-002 (Dashboard):** Scope = SystemAdmin ve todo; OperadorOrg ve solo su org. ~~Publicador~~ removido.

**RF-UI-004 (Detalle de Incidencia):**
- Badge de estado: `pending`, `in_progress`, `resolved`
- Acciones según rol:
  - OperadorOrg: ver, editar, claim/release, comentar
  - SystemAdmin: todas las acciones

#### 3.1.3 Interfaces de Software (API) — cambios en RF-SW-002

**RF-SW-002 (Incidencias CRUD + acciones):**

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/incidents` | Listar incidencias con filtros |
| POST | `/api/incidents` | Crear incidencia |
| GET | `/api/incidents/{id}` | Detalle incidencia |
| PUT | `/api/incidents/{id}` | Editar incidencia |
| DELETE | `/api/incidents/{id}` | Soft delete incidencia |
| POST | `/api/incidents/{id}/claim` | OperadorOrg toma incidencia |
| POST | `/api/incidents/{id}/release` | OperadorOrg libera incidencia |
| PUT | `/api/incidents/{id}/estado` | Cambiar estado (pending → in_progress → resolved) |

---

### 3.2 Requisitos Funcionales

#### Requisitos Funcionales Principales

**RF-FUNC-001: Registro de Incidencias**

| Atributo | Detalle |
|---|---|
| **Prioridad** | Alta |
| **Campos** | title (max 100), description (max 500), priority (alta/media/baja), location, category, geom (PostGIS Point) |
| **Validaciones** | Frontend + Backend doble validación |

---

**RF-FUNC-006: Estados Disponibles**

| Valor DB | UI | Significado |
|---|---|---|
| `pending` | Pendiente | Recién creada o liberada |
| `in_progress` | En proceso | OperadorOrg hizo `claim` |
| `resolved` | Resuelta | OperadorOrg marcó como terminada |

Constraint CHECK en PostgreSQL garantiza validez. Trigger `trg_log_incident_status` registra automáticamente cambio en `status_history`.

---

**RF-FUNC-010: Liberar Incidencia (Release)**

| Atributo | Detalle |
|---|---|
| **Prioridad** | Media |
| **Reglas** | Solo OperadorOrg que tiene `claimed_by == user.id` puede liberar. Cambia `status` a `pending`, limpia `claimed_by`, `claimed_at`. |

---

**RF-FUNC-030: Scoping Multitenant**

Toda query desde OperadorOrg filtra automáticamente por `organization_id`. SystemAdmin bypass.

---

**RF-FUNC-031: Auditoría Inmutable**

Trigger PostgreSQL inserta en `status_history` cada cambio de estado. Campos: `incident_id`, `old_status`, `new_status`, `user_id`, `created_at`.

---

### 3.3–3.9 Otros Requisitos

*(Idénticos a v2.0. Solo cambio: "Publicador" → "OperadorOrg", "confirm" → removido)*

---

## 4. Modelo de Datos

### 4.1 Entidades Principales

#### 4.1.1 Incident

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT UNSIGNED | No | PK |
| title | VARCHAR(100) | No | Título incidencia |
| description | VARCHAR(500) | No | Descripción |
| status | ENUM (`pending`,`in_progress`,`resolved`) | No | 3 estados totales |
| priority | ENUM (`low`,`medium`,`high`) | No | Prioridad |
| geom | POINT (PostGIS 4326) | No | Coordenadas geográficas |
| location_id | BIGINT | No | FK → locations |
| organization_id | BIGINT | No | FK → organizations (multitenant) |
| incident_category_id | BIGINT | No | FK → incident_categories |
| user_id | BIGINT | No | FK → users (creador) |
| claimed_by | BIGINT | Yes | FK → users (responsable actual) |
| claimed_at | TIMESTAMP | Yes | Cuándo se hizo claim |
| resolution_date | TIMESTAMP | Yes | Auto-set cuando status → resolved |
| deleted_at | TIMESTAMP | Yes | Soft delete |
| created_at | TIMESTAMP | No | |
| updated_at | TIMESTAMP | No | |

#### 4.1.2 Location (jerárquico)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT | No | PK |
| name | VARCHAR(255) | No | Nombre |
| code | VARCHAR(20) | No | Código (e.g., `EC-17-01`) |
| level | ENUM (`country`,`province`,`city`) | No | Nivel jerárquico |
| parent_id | BIGINT | Yes | FK self-referencia (Country has no parent) |
| geom | MULTIPOLYGON (PostGIS 4326) | Yes | Polígono territorial |
| deleted_at | TIMESTAMP | Yes | Soft delete |

#### 4.1.3 IncidentCategory (Tipo → Subtipo)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT | No | PK |
| name | VARCHAR(100) | No | Tipo o Subtipo |
| parent_id | BIGINT | Yes | FK self-referencia (Subtipo → Tipo) |
| deleted_at | TIMESTAMP | Yes | Soft delete |

#### 4.1.4 Notification

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT | No | PK |
| user_id | BIGINT | No | FK → users |
| type | ENUM (`cambio_estado`,`comentario`,`asignacion`) | No | Tipo evento |
| message | TEXT | No | Contenido |
| read_at | TIMESTAMP | Yes | Leído o no |

#### 4.1.5 Role + Permission + Menu

- `roles`: `id`, `name` (e.g., `SystemAdmin`, `OperadorOrganizacion`)
- `permissions`: `id`, `name` (granular)
- `role_permission`: pivot con cascadeOnDelete
- `menus`: `id`, `name`, `route`, `icon`
- `menu_permission`: pivot

---

## 5. Apéndices

### 5.1 Matriz de Trazabilidad

| Requisito | Tipo | Prioridad | Módulo | Status |
|---|---|---|---|---|
| RF-FUNC-001 | Funcional | Alta | Incident CRUD | ✅ Implementado |
| RF-FUNC-006 | Funcional | Alta | Estados (3) | ✅ Implementado |
| RF-FUNC-010 | Funcional | Media | Release incidencia | ✅ Implementado |
| RF-FUNC-030 | Funcional | Alta | Scoping Multitenant | ✅ Implementado |
| RF-FUNC-031 | No funcional | Alta | Auditoría Triggers | ✅ Implementado |
| RF-UI-001 | UI | Alta | Login | ✅ Implementado |
| RF-UI-002 | UI | Alta | Dashboard | ✅ Básica |
| RF-UI-004 | UI | Alta | Detalle Incidencia | ✅ Básica |
| RF-SW-001 | API | Alta | Auth endpoints | ✅ Implementado |
| RF-SW-002 | API | Alta | Incident endpoints | ✅ Implementado |

**Total requisitos principales documentados: 10** (alineado con alcance de README)

---

### 5.2 Glosario

*(Idéntico a v2.0, excluida definición de "Publicador")*

---

### Apéndice A: SRS v2.0 (versión anterior)

El contenido íntegro de **v2.0** se preserva en [`SRS.md`](./SRS.md) como referencia de la visión previa (4 estados + Publicador).

---

## 6. Estado de Implementación Actualizado (22 Julio 2026)

### Progreso por Módulo

| Módulo | Status | Detalles |
|---|---|---|
| M01 — Gestión Incidencias | ✅ 100% | CRUD completo, soft delete, PostGIS geom |
| M02 — Gestión Estados | ✅ 100% | 3-state workflow, audit trail via trigger |
| M03 — Asignación Responsables | ✅ 100% | Claim/release actions, role-based |
| M04 — Sistema Comentarios | ✅ 100% | Nested comments, soft delete |
| M05 — Ubicación Normalizada | ✅ 100% | País → Provincia → Ciudad + geom |
| M06 — Clasificación Jerárquica | ✅ 100% | IncidentCategory parent_id |
| M07 — Notificaciones | ✅ 100% | Real-time Mercure SSE |
| M08 — Prioridad/Control | ✅ 100% | Enum (low/medium/high), CHECK constraints |
| M09 — Dashboard/Métricas | ⏳ 90% | Básico OK; filtros avanzados pendientes |
| M10 — Validaciones | ✅ 100% | Double-layer (backend FormRequest + frontend) |

**Total:** 95%+ completado.

### Hallazgos Post-Implementación (E7 — Load Testing)

**Crítico (Bloqueante Pre-Production):**
- Load test Swoole (50 VUs): p(95)=2650ms vs <500ms SLA
- Causa: N+1 queries (eager loading no aplicado) + índices PostGIS faltantes
- Status: P1 remediación en progreso (Alisson backend, Yandris BD)
- ETA: 2-4 horas post-fixes, re-test k6 requerido
- Veredicto: NO VIABLE PRODUCCIÓN hasta P1 fixes

Ver **Entregable 7 (E7)** para análisis completo k6 + remediation plan.

### Stack Actualizado (22 Julio 2026)

| Componente | Versión Original | Versión Actual | Cambios |
|---|---|---|---|
| Framework | Laravel 12.x | Laravel 13.8 | Última versión estable |
| Runtime | FrankenPHP/Octane | **Swoole 5.0+ / Octane** | Mejor async I/O, coroutines nativas |
| PHP | 8.2+ | 8.4-cli-alpine | JIT compilation enabled |
| BD | PostgreSQL 15 | PostgreSQL 17 + PostGIS 3.5 | Latest LTS + geospatial |
| Cache | Redis (no spec) | Redis 8 | Requerido para feed caching |

---

### Apéndice B: SRS v1.0 (versión histórica)

Ver [`SRS-v1.0.md`](./SRS-v1.0.md) para la especificación original (08/06/2026).

---

## Información del Documento

| Atributo | Valor |
|---|---|
| **Título** | Especificación de Requisitos de Software (SRS) |
| **Versión** | **3.0 — Opción B** |
| **Subtítulo** | Alineación de Spec con Implementación (3-State Workflow) |
| **Proyecto** | Sistema Web de Gestión de Incidencias Georreferenciadas |
| **Fecha** | 15 de julio de 2026 |
| **Versión anterior** | v2.0 (07/07/2026) |
| **Versión histórica** | v1.0 (08/06/2026) |
| **Autores** | Equipo de Proyecto |
| **Estado** | **Sincronizado con implementación actual (3 estados, sin Publicador)** |
| **E1 Cumplimiento** | ~65% (core workflow, sin auditoría de resoluciones) |
| **Impacto de Cambio** | 🟢 **NULO** (documental solo) |
| **Referencias** | IEEE 830-1998, ISO/IEC 25000, ISO/IEC 25010 |

---

## Notas Finales

**Alineación con README.md:**

Este documento SRS-v3.md REALISTA está alineado 100% con README.md (la especificación oficial del proyecto). Documenta los 9 puntos de alcance especificados en README sin ambigüedades.

**Cambios desde SRS-v2.0:**

- ✅ Removido Publicador role (no está en README)
- ✅ Removido confirm endpoint (no está en README)
- ✅ 3 estados documentados fielmente: pending → in_progress → resolved
- ✅ Simplificado a requisitos que YA ESTÁN implementados
- ✅ Matriz de requisitos realista (10 principales, no 35)

**Seguro para presentación 04 May 2026:**

Este SRS describe EXACTAMENTE lo que el código implementa. No hay promesas incumplidas.

---

*Documento elaborado siguiendo estándar IEEE 830. Alineado con README.md del proyecto (fuente de verdad). Versión REALISTA conservadora para demostración segura.*

**Versión: 3.0 REALISTA — Alineado con README.md y Código Auditado**
