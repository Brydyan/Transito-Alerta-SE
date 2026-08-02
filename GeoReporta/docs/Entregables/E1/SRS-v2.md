# Especificación de Requisitos de Software (SRS)

## Sistema Web de Gestión de Incidencias Georreferenciadas

---

**Versión del Documento:** 2.0
**Fecha:** 07 de julio de 2026
**Estado:** Sincronizado con la implementación actual
**Nivel de Confianza:** Validado contra código fuente
**Versión anterior:** v1.0 (08/06/2026) preservada íntegra en [`SRS-v1.0.md`](./SRS-v1.0.md)

---

## Historial de Revisiones

| Versión | Fecha | Descripción | Autor |
|---------|-------|-------------|-------|
| 1.0 | 08/06/2026 | Creación inicial del documento SRS | Equipo de Proyecto |
| 2.0 | 07/07/2026 | Sincronización con la implementación actual. v1.0 preservada en archivo separado `SRS-v1.0.md` como referencia histórica. Ver resumen ejecutivo de cambios al inicio. | Equipo de Proyecto |

---

## Resumen ejecutivo de cambios v1.0 → v2.0

### Stack tecnológico

| Componente | v1.0 (original) | v2.0 (actual) |
|---|---|---|
| Framework backend | Laravel 10.x | **Laravel 12.x** sobre **Frankenphp/Octane** |
| Lenguaje backend | PHP 8.2+ | PHP 8.2+ (sin cambios) |
| Base de datos | MySQL 8.0 o PostgreSQL 15 | **PostgreSQL 15 con PostGIS** (sin MySQL) |
| Autenticación | Token Bearer (JWT) o sesión | **JWT** (`tymon/jwt-auth`) con endpoint `/auth/refresh` |
| Frontend | HTML+CSS+Bootstrap+JS vanilla | Idem + **AngularJS** (módulos custom) + **Vitest** (unit/integration/snapshot) |
| Cache / sync | No especificado | **Redis** (`RedisIncidentSync` listener) |
| Geolocalización | País/Provincia/Ciudad normalizado | Idem + columna `geom` (**Point**, PostGIS) en `incidents` y `locations` |
| Reverse proxy | Nginx | Nginx (sin cambios) |
| Contenedores | Docker Compose | Docker Compose (sin cambios) |

### Modelo de datos — cambios principales

- **Estados**: v1.0 describía 4 estados nominales (`Pendiente`, `En Proceso`, `Resuelto`, `Cerrado`). El modelo actual usa 4 valores en la columna `incidents.status` con constraint CHECK en PostgreSQL: **`pending`**, **`pending_operator`**, **`in_progress`**, **`resolved`**. El "Cerrado" del SRS se reemplazó por la acción `confirmar` que registra una fila en `incident_verifications` sin modificar `status`.
- **Prioridad**: v1.0 usaba `alta|media|baja`. El código usa un enum PHP `IncidentPriority` con valores **`low`**, **`medium`**, **`high`** (en inglés en BD; la UI los localiza).
- **Clasificación**: v1.0 planteaba **Tipo → Subtipo** jerárquico. El modelo actual colapsa a una única entidad `incident_categories` con autorrelación `parent_id` (categoría y subcategoría opcional).
- **Ubicación**: la jerarquía País → Provincia → Ciudad se conserva, **más** la columna `geom` (Point, PostGIS) en `incidents` y `locations` para queries geoespaciales.
- **Asignación de responsables**: v1.0 proponía tabla pivote `IncidenciaResponsable` con roles `responsable|apoyo`. Esa tabla fue **dropeada** (migración `2026_07_05_000001_drop_assignments_table.php`) y reemplazada por la acción `claim` con `claimed_by` + `claimed_at` y un `max_active_claims` por organización.
- **Verificación**: v2.0 agrega `incident_verifications` (separado del flujo de status).
- **Multitenant**: v1.0 no contemplaba. v2.0 introduce `users.organization_id`, `incidents.organization_id` y `organizations.parent_id` (jerárquica). El scoping se aplica en `IncidentPolicy` y se refuerza con middleware.
- **Auditoría inmutable**: la tabla `status_history` se llena mediante un **trigger de base de datos** (migración `2026_06_15_000010_create_incident_triggers.php`), no desde código de aplicación. Esto garantiza inmutabilidad incluso si el código es comprometido.

### Actores / Roles

- v1.0: `admin`, `operador`, visitante
- v2.0:
  - `SystemAdmin` (cross-tenant, bypass de scope)
  - `OperadorOrganizacion` (scoped a su org, ejecuta `claim`/`release`)
  - ~~`Publicador`~~ (rol eliminado — migración `2026_07_08_000002_remove_publicador_role_and_verifications.php`; el flujo de 3 estados Pendiente→En proceso→Resuelto no lo necesitaba)
  - ~~Visitante (sin auth)~~ — retirado: ya no existe acceso anónimo, toda ruta exige JWT. El registro (`POST /register`) sigue siendo público, pero asigna el rol `usuario` (autenticado, sin permisos elevados) en vez de dejar navegar sin sesión.

Las acciones `claim`, `release` y `confirmar` tienen gates `can:claim`, `can:release`, `can:confirm` en `IncidentPolicy`.

### Endpoints nuevos

- `POST /api/incidents/{id}/claim` (OperadorOrg de la org dueña)
- `POST /api/incidents/{id}/release` (OperadorOrg que hizo el claim)
- `POST /api/incidents/{id}/confirmar` (Publicador de org cuya categoría coincide)
- `POST /api/operator/location` y `GET /api/operator/locations` (tracking de operadores)
- `GET /api/menus/my` (menú dinámico por rol)
- `GET /api/incidents/feed` (autenticado, throttled — ver nota sobre retiro del rol Visitante)

### Numeración de requisitos

- `RF-FUNC-001` a `RF-FUNC-028` se renumeran parcialmente para reflejar el flujo real.
- Se agregan `RF-FUNC-029` a `RF-FUNC-035` para cubrir: claim, release, confirm, tracking de operador, menú dinámico, scoping multitenant y soft delete de `incident_verifications`.

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
   - 3.3 Requisitos de Rendimiento
   - 3.4 Requisitos de Fiabilidad
   - 3.5 Requisitos de Disponibilidad
   - 3.6 Requisitos de Seguridad
   - 3.7 Requisitos de Mantenibilidad
   - 3.8 Requisitos de Portabilidad
   - 3.9 Otros Requisitos
4. Modelo de Datos
5. Apéndices
   - 5.1 Matriz de Trazabilidad
   - 5.2 Glosario
   - Apéndice A: SRS v1.0 (versión histórica) — ver [`SRS-v1.0.md`](./SRS-v1.0.md)

---

## 1. Introducción

### 1.1 Propósito

Este documento establece la especificación de requisitos de software **sincronizada con la implementación actual** del Sistema Web de Gestión de Incidencias Georreferenciadas. La versión v1.0 (08/06/2026) se preserva íntegra en el archivo [`SRS-v1.0.md`](./SRS-v1.0.md) como referencia de la visión original; las divergencias entre ambas versiones se documentan en el resumen ejecutivo al inicio de este documento.

El SRS sirve como acuerdo contractual entre el equipo de desarrollo y las asignaturas involucradas, y como referencia para onboarding, refactors y auditorías.

### 1.2 Alcance del Producto

El sistema consistirá en una aplicación web completa que permitirá:

- El registro, gestión y seguimiento completo de **incidencias georreferenciadas** (con coordenadas PostGIS y dirección normalizada País → Provincia → Ciudad).
- La **toma de responsabilidad** sobre una incidencia mediante la acción `claim` (reemplaza la asignación rígida de v1.0).
- La **confirmación de resolución** por un actor con rol `Publicador`, separada del flujo de status.
- El seguimiento mediante **comentarios anidados** (shallow) y **notificaciones** por evento.
- La **clasificación jerárquica** por categoría y subcategoría.
- La **visualización de métricas y dashboards** con filtros avanzados.
- El **tracking de operadores** (ubicación reportada voluntariamente).
- La **gestión de menú dinámico** por rol (`GET /menus/my`).
- El **aislamiento multitenant** por organización, con `SystemAdmin` como bypass.

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
| **Claim** | Acción por la cual un OperadorOrg toma responsabilidad sobre una incidencia. Equivale a "asignarse" pero respetando el `max_active_claims` de su org. |
| **Docker** | Plataforma de contenedores |
| **ER** | Entity Relationship |
| **FK** | Foreign Key |
| **Frankenphp** | Servidor de aplicaciones PHP moderno basado en Caddy; usado con Laravel Octane. |
| **HTTP** | Hypertext Transfer Protocol |
| **JSON** | JavaScript Object Notation |
| **JWT** | JSON Web Token; mecanismo de autenticación stateless. |
| **Laravel** | Framework PHP |
| **Multitenant** | Arquitectura donde los datos de cada organización (tenant) están aislados lógicamente por un `organization_id`. |
| **Octane** | Capa de Laravel que mantiene la app en memoria entre requests (alto rendimiento). |
| **OperadorOrg** | Abreviatura de `OperadorOrganizacion`; usuario de una organización que puede hacer `claim`/`release`. |
| **PostGIS** | Extensión de PostgreSQL para datos geoespaciales (puntos, polígonos, queries de distancia, etc.). |
| **Publicador** | Rol que confirma la resolución de una incidencia cuya categoría coincide con la de su organización. |
| **REST** | Representational State Transfer |
| **Scope** | Restricción multitenant: un usuario solo ve/edita datos de su propia organización (excepto `SystemAdmin`). |
| **SRS** | Software Requirements Specification |
| **SQL** | Structured Query Language |
| **SystemAdmin** | Rol cross-tenant con bypass del scope. |
| **Trigger** | Mecanismo de base de datos que ejecuta lógica automáticamente ante eventos DML. En este proyecto, `status_history` se llena por trigger, no por código de aplicación. |
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

Este documento sigue la estructura IEEE 830. La Sección 2 describe el producto y sus restricciones. La Sección 3 contiene los requisitos específicos. La Sección 4 presenta el modelo de datos. La Sección 5 incluye apéndices. El archivo [`SRS-v1.0.md`](./SRS-v1.0.md) preserva la versión v1.0 histórica sin modificaciones.

---

## 2. Descripción General

### 2.1 Perspectiva del Producto

El sistema es una aplicación web con arquitectura de tres capas, desplegada en contenedores Docker:

- **Capa de Presentación (Frontend)**: HTML5 + CSS3 + Bootstrap + JavaScript vanilla con AngularJS como framework de módulos. Comunicación asíncrona vía `fetch`. Servido por Nginx.
- **Capa de Lógica de Negocio (Backend)**: API REST en **Laravel 12** corriendo sobre **Frankenphp/Octane**. Organizada en 13 dominios DDD: Auth, Comments, IncidentCategories, Incidents, Locations, Menus, Notifications, Organizations, Permissions, Roles, Sessions, Shared, Users. Autenticación vía **JWT**. Container: `frankenphp-worker`.
- **Capa de Datos**: **PostgreSQL 15** con extensión **PostGIS**. Redis como cache y bus de sincronización entre instancias de Octane.

El despliegue usa Docker Compose con servicios: `backend` (Frankenphp), `frontend` (Nginx), `postgres` (PostgreSQL+PostGIS), `redis`.

### 2.2 Funcionalidades del Producto

1. **Gestión de Incidencias**: CRUD completo con upload de imágenes (multipart) y coordenadas geográficas.
2. **Máquina de Estados**: Transiciones controladas con auditoría inmutable vía trigger de DB.
3. **Toma y Liberación de Responsabilidad**: `claim`/`release` por OperadorOrg con control de concurrencia (`max_active_claims`).
4. **Confirmación de Resolución**: `confirmar` por Publicador; registra verificación sin cambiar `status`.
5. **Sistema de Comentarios**: Anidados shallow por incidencia, con soft delete.
6. **Ubicación Georreferenciada**: Coordenadas PostGIS + dirección normalizada jerárquica.
7. **Clasificación Jerárquica**: Categoría con subcategoría opcional (autorreferencia `parent_id`).
8. **Notificaciones**: Generadas por Observer Eloquent ante eventos relevantes.
9. **Menú Dinámico por Rol**: El frontend pide `GET /menus/my` y renderiza solo lo permitido.
10. **Tracking de Operadores**: Endpoint de heartbeat geográfico.
11. **Dashboard y Métricas**: Conteos por estado, por tipo, por org; tiempo promedio de resolución.
12. **Scoping Multitenant**: Aislamiento automático por organización para OperadorOrg y Publicador; bypass para SystemAdmin.
13. **Sincronización en Tiempo Real**: Redis pub/sub vía `RedisIncidentSync` listener (preparado para WebSockets futuros).

### 2.3 Clases de Usuario y Características

#### 2.3.1 SystemAdmin

| Atributo | Detalle |
|---|---|
| **Rol** | Usuario cross-tenant con privilegios completos |
| **Permisos** | CRUD sobre todas las entidades de todas las organizaciones; bypass de scope en todas las policies |
| **Frecuencia de uso** | Media |
| **Nivel de expertise** | Alto |

#### 2.3.2 OperadorOrganizacion

| Atributo | Detalle |
|---|---|
| **Rol** | Operador de una organización específica; toma y libera incidencias de su org |
| **Permisos** | Ver/editar incidencias de su org; `claim`/`release`; comentar; reportar ubicación propia; ver dashboard personal |
| **Restricción** | Máximo `max_active_claims` simultáneas (configurado por org) |
| **Frecuencia de uso** | Alta |
| **Nivel de expertise** | Básico a intermedio |

#### 2.3.3 Publicador

| Atributo | Detalle |
|---|---|
| **Rol** | Usuario verificador; confirma resoluciones de la categoría de su org |
| **Permisos** | Ver todas las incidencias de su org; `confirmar` solo si la `incident_category_id` de la incidencia coincide con la `incident_category_id` de su organización |
| **Frecuencia de uso** | Media |
| **Nivel de expertise** | Intermedio |

#### 2.3.4 ~~Visitante (sin autenticación)~~ — rol retirado

Ya no existe acceso anónimo al sistema. `GET /incidents/feed` ahora exige JWT
igual que el resto de rutas (excepto `/login`, `/register`, `/auth/refresh`,
`/auth/google` y `/health`). Quien quiera ver el feed se registra (rol
`usuario`, sin permisos elevados) y se autentica como cualquier otro rol.

### 2.4 Ambiente Operativo

#### 2.4.1 Plataforma de Hardware

| Componente | Especificación Mínima | Recomendada |
|---|---|---|
| Servidor de aplicaciones | 2 cores, 4 GB RAM | 4 cores, 8 GB RAM |
| Servidor de BD | 2 cores, 4 GB RAM | 4 cores, 8 GB RAM |
| Almacenamiento | 20 GB | 50 GB SSD |
| Red | 100 Mbps | 1 Gbps |

#### 2.4.2 Plataforma de Software

| Componente | Versión |
|---|---|
| Sistema Operativo | Linux (Ubuntu 22.04 LTS o equivalente) |
| Contenedores | Docker Engine 20.10+ con Docker Compose |
| Servidor Web (frontend) | Nginx |
| Runtime PHP | PHP 8.2+ |
| Servidor de aplicaciones backend | Frankenphp + Laravel Octane |
| Framework Backend | Laravel 12.x |
| Base de datos | PostgreSQL 15 + PostGIS |
| Cache / sync | Redis 7+ |
| Navegador Cliente | Chrome 90+, Firefox 90+, Safari 14+, Edge 90+ |

#### 2.4.3 Ambiente de Red

- Frontend ↔ Backend: HTTP/HTTPS a través de Nginx (reverse proxy).
- CORS restrictivo (orígenes whitelistados en `config/cors.php`).
- Tráfico en JSON sobre UTF-8.
- Auth vía header `Authorization: Bearer <jwt>`.

### 2.5 Restricciones de Diseño e Implementación

| Restricción | Descripción |
|---|---|
| Backend | Laravel (API REST en PHP) — obligatorio |
| Frontend | HTML5, CSS3, Bootstrap, JavaScript — obligatorio |
| Base de datos | PostgreSQL con PostGIS — obligatorio |
| Autenticación | JWT (stateless) — obligatorio |
| Despliegue | Contenedores Docker con Docker Compose — obligatorio |
| Estilo de código | PSR-12 verificado con Laravel Pint |
| Arquitectura backend | DDD con 13 dominios, no MVC clásico |
| Arquitectura frontend | AngularJS modular (sin frameworks SPA modernos) |
| Auditoría | `status_history` por trigger de DB (no por código) |
| Tiempo de entrega | Calendario académico 2026 |

### 2.6 Suposiciones y Dependencias

#### Suposiciones

- Los usuarios utilizarán navegadores modernos y actualizados.
- El acceso a internet es estable (no se contempla modo offline).
- Los datos de ubicación (Países, Provincias, Ciudades) están precargados (`EcuadorLocationSeeder`).
- Las categorías base están precargadas (`IncidentCategorySeeder`).
- Docker está instalado en el entorno de despliegue.
- Cada organización registra su `incident_category_id` y `max_active_claims` antes de operar.

#### Dependencias

| Dependencia | Impacto |
|---|---|
| Laravel Framework 12.x | Crítico |
| PostGIS | Crítico (cambia la semántica de `geom`) |
| Frankenphp/Octane | Crítico (afecta el ciclo de vida del request) |
| Redis | Alto (sync, no crítico para servir requests) |
| tymon/jwt-auth | Crítico (autenticación) |
| Docker Engine | Crítico |

---

## 3. Requisitos Específicos

### 3.1 Requisitos de Interfaces Externas

#### 3.1.1 Interfaces de Usuario

##### RF-UI-001: Pantalla de Login

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-001 |
| **Prioridad** | Alta |
| **Descripción** | Login con email y contraseña; devuelve JWT. |

- Validación de formato de email en tiempo real.
- Botón "Ingresar" con estado de carga.
- Mensaje de error genérico para credenciales inválidas (no revela qué campo falló).
- Diseño responsivo.
- Token almacenado en el cliente y reenviado en cada request autenticado.

##### RF-UI-002: Dashboard Principal

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-002 |
| **Prioridad** | Alta |
| **Descripción** | Métricas filtradas por scope (SystemAdmin ve todo; OperadorOrg/Publicador ven solo su org). |

- Tarjetas: total, pendientes, en proceso, resueltas.
- Gráficos: distribución por estado, por categoría.
- Filtros: rango de fechas, categoría, ubicación, estado.
- Tabla resumen con últimas incidencias.
- Acciones rápidas: crear, ver pendientes, ver mis claim.

##### RF-UI-003: Formulario de Creación/Edición de Incidencia

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-003 |
| **Prioridad** | Alta |

- Campos: título (3-100), descripción (10-500), prioridad (`low|medium|high`), ubicación (jerárquica + opcionalmente `geom` desde mapa), categoría (cascada), imágenes (multipart).
- Validación inline.
- Botón guardar con estado de carga.
- Cancelar para volver sin guardar.

##### RF-UI-004: Vista de Detalle de Incidencia

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-004 |
| **Prioridad** | Alta |

- Encabezado con título y badge de estado (`pending`/`pending_operator`/`in_progress`/`resolved`).
- Datos generales + ubicación + categoría + coordenadas PostGIS (mapa).
- Pestaña de historial de status (inmutable, alimentado por trigger de DB).
- Sección de comentarios con formulario.
- Acciones según rol:
  - OperadorOrg: `claim` (si no asignado y misma org), `release` (si él lo claimó), editar.
  - Publicador: `confirmar` (si categoría coincide con la de su org).
  - SystemAdmin: todo.

##### RF-UI-005: Menú Dinámico por Rol

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-005 |
| **Prioridad** | Alta |

- Al autenticarse, el frontend pide `GET /api/menus/my` y renderiza solo lo permitido.
- Permite agregar/quitar opciones sin redeploy.
- Tabla `menus` con `route` opcional nullable (migración `2026_07_06_000001`).

##### RF-UI-006: Panel de Notificaciones

| Atributo | Detalle |
|---|---|
| **ID** | RF-UI-006 |
| **Prioridad** | Media |

- Badge con contador de no leídas (`GET /notifications/unread-count`).
- Lista desplegable con últimas notificaciones.
- Marcar como leída individual (`PATCH /notifications/{id}/read`) o todas (`PATCH /notifications/read-all`).
- Indicador visual leído/no leído.

#### 3.1.2 Interfaces de Hardware

No aplica. Sistema completamente web.

#### 3.1.3 Interfaces de Software (API)

> Convenciones:
> - Todas las rutas autenticadas requieren header `Authorization: Bearer <jwt>`.
> - El cuerpo de las requests y responses es JSON sobre UTF-8.
> - Los códigos de error siguen convención HTTP estándar (4xx cliente, 5xx servidor).

##### RF-SW-001: Autenticación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/login` | No | Login; devuelve `access_token` y `refresh_token` |
| POST | `/api/auth/refresh` | No | Refresca el access token usando refresh token |
| POST | `/api/logout` | JWT | Invalida el token actual |
| GET | `/api/me` | JWT | Datos del usuario autenticado |
| PUT | `/api/auth/profile` | JWT | Actualiza perfil del usuario |

##### RF-SW-002: Incidencias (CRUD + acciones)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/incidents` | JWT | Lista con filtros y paginación (scope automático) |
| GET | `/api/incidents/pendientes` | JWT | Lista de pendientes (útil para OperadorOrg) |
| GET | `/api/incidents/stats` | JWT | Métricas agregadas |
| GET | `/api/incidents/{id}` | JWT | Detalle (verifica scope) |
| POST | `/api/incidents` | JWT | Crear (multipart: acepta `images[]` y `geom`) |
| PUT | `/api/incidents/{id}` | JWT | Editar (gate `update`) |
| DELETE | `/api/incidents/{id}` | JWT | Soft delete (gate `delete`) |
| POST | `/api/incidents/{id}/claim` | JWT | `can:claim` — OperadorOrg de la org dueña |
| POST | `/api/incidents/{id}/release` | JWT | `can:release` — OperadorOrg que hizo el claim |
| POST | `/api/incidents/{id}/confirmar` | JWT | `can:confirm` — Publicador de org con categoría coincidente |
| GET | `/api/incidents/{id}/status-history` | JWT | Historial inmutable |

##### RF-SW-003: Comentarios

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/incidents/{id}/comments` | JWT | Lista de comentarios |
| POST | `/api/incidents/{id}/comments` | JWT | Crear comentario |
| PATCH/DELETE | `/api/comments/{id}` | JWT | Editar/eliminar (solo autor, soft delete) |

Rutas anidadas con `shallow` (prefijo solo en la colección).

##### RF-SW-004: Notificaciones

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/notifications` | JWT | Lista de notificaciones del usuario |
| PATCH | `/api/notifications/{id}/read` | JWT | Marcar una como leída |
| PATCH | `/api/notifications/read-all` | JWT | Marcar todas como leídas |
| GET | `/api/notifications/unread-count` | JWT | Conteo de no leídas |

##### RF-SW-005: Catálogos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/locations/tree` | JWT | Árbol País → Provincia → Ciudad |
| CRUD | `/api/locations` | JWT | Mantenimiento de ubicaciones |
| GET | `/api/organizations/tree` | JWT | Árbol de organizaciones (jerárquico por `parent_id`) |
| CRUD | `/api/organizations` | JWT | Mantenimiento de organizaciones |
| GET | `/api/incident-categories/tree` | JWT | Árbol de categorías con subcategorías |
| CRUD | `/api/incident-categories` | JWT | Mantenimiento de categorías |

##### RF-SW-006: RBAC

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| CRUD | `/api/roles` | JWT | Mantenimiento de roles |
| PUT | `/api/roles/{id}/permissions` | JWT | Sincronizar permisos de un rol |
| GET | `/api/permissions` | JWT | Listar permisos disponibles |
| GET | `/api/menus/my` | JWT | Menú del usuario según su rol |
| CRUD | `/api/users` | JWT | Mantenimiento de usuarios |

##### RF-SW-007: Tracking de Operadores

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/operator/location` | JWT | Reporta la ubicación actual del operador (heartbeat) |
| GET | `/api/operator/locations` | JWT | Lista ubicaciones recientes de operadores (filtrado por scope) |

##### RF-SW-008: Feed de incidencias

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/incidents/feed` | JWT | Feed throttled (`throttle:feed`); ya no es público — el rol Visitante fue retirado, toda cuenta se autentica |

##### RF-SW-009: Health

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | No | Liveness check (`{"status":"ok"}`) |

#### 3.1.4 Interfaces de Comunicación

| Atributo | Detalle |
|---|---|
| Protocolo | HTTP/HTTPS |
| Formato | JSON (UTF-8) |
| Autenticación | JWT Bearer |
| CORS | Restrictivo (whitelist por origen) |

---

### 3.2 Requisitos Funcionales

> Requisitos renumerados desde v1.0; los rangos `029`-`035` son nuevos en v2.0.

#### Incidencias (CRUD)

##### RF-FUNC-001: Crear Incidencia

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-001 |
| **Prioridad** | Alta |

**Reglas:**

1. Título obligatorio, 3-100 caracteres.
2. Descripción obligatoria, 10-500 caracteres.
3. Prioridad: `low`, `medium` o `high`.
4. Ubicación completa: País + Provincia + Ciudad.
5. Coordenadas geográficas (`geom` Point, PostGIS) opcionales pero recomendadas.
6. Categoría + subcategoría opcional (si se da subcategoría, debe tener como `parent_id` la categoría elegida).
7. Estado inicial: `pending`.
8. `user_id` (creador) y `organization_id` (del usuario creador) se asignan automáticamente.
9. `created_at` automático.
10. `images` opcional, array de strings (URLs o paths).

**Validaciones:** Frontend bloquea envío; backend valida con Form Request y prepara 422 con detalle.

##### RF-FUNC-002: Listar Incidencias

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-002 |
| **Prioridad** | Alta |

- Paginación (20 por defecto).
- Filtros: `status`, `priority`, `incident_category_id`, `location_id`, rango de fechas, búsqueda por título/descripción.
- Orden: `created_at` desc por defecto.
- **Scope automático**: OperadorOrg/Publicador solo ven de su organización. SystemAdmin ve todas.

##### RF-FUNC-003: Ver Detalle de Incidencia

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-003 |
| **Prioridad** | Alta |

Incluye: datos generales, ubicación (jerárquica + `geom`), categoría + subcategoría, `claimed_by`, `claimed_at`, estado actual, historial de status, comentarios, verificaciones.

##### RF-FUNC-004: Editar Incidencia

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-004 |
| **Prioridad** | Alta |

- Campos editables: título, descripción, prioridad, ubicación, `geom`, categoría, subcategoría, imágenes.
- No se edita `status` directamente (eso va por `claim`/`release`/`confirmar`).
- `updated_at` se actualiza automáticamente.

##### RF-FUNC-005: Eliminar Incidencia (soft delete)

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-005 |
| **Prioridad** | Media |

- Soft delete (`deleted_at`).
- Confirmación previa.
- No aparece en listados normales.

#### Estados y Auditoría

##### RF-FUNC-006: Estados Disponibles

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-006 |
| **Prioridad** | Alta |

| Valor DB | Localización UI | Significado |
|---|---|---|
| `pending` | Pendiente | Recién creada, sin asignar |
| `pending_operator` | Asignada a organización | Asignada a una org, sin operador que la haya tomado |
| `in_progress` | En proceso | Un OperadorOrg hizo `claim` |
| `resolved` | Resuelta | El OperadorOrg marcó el trabajo como terminado |

Valores garantizados por constraint CHECK en PostgreSQL. No existe el valor `closed` de v1.0; la verificación es una acción separada.

##### RF-FUNC-007: Cambiar Estado

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-007 |
| **Prioridad** | Alta |

Las transiciones son controladas por las acciones específicas (`claim` → `in_progress`, `release` → `pending_operator`, edición normal no cambia status). Cada cambio escribe automáticamente en `status_history` mediante **trigger de base de datos** (no por código de aplicación).

##### RF-FUNC-008: Historial de Cambios

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-008 |
| **Prioridad** | Alta |

- Inmutable: el trigger garantiza que no se pueda UPDATE ni DELETE.
- Datos: `incident_id`, `previous_status`, `new_status`, `changed_by_user_id` (extraído de la sesión JWT por el trigger), `created_at`.
- Visible en orden cronológico inverso en `GET /incidents/{id}/status-history`.

#### Responsabilidad (claim/release) — NUEVO en v2.0

##### RF-FUNC-009: Tomar Incidencia (Claim)

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-009 |
| **Prioridad** | Alta |

**Reglas:**

1. Solo `OperadorOrganizacion` con `user.organization_id == incident.organization_id`.
2. El incidente debe estar en `pending` o `pending_operator`.
3. El operador no debe exceder el `max_active_claims` de su organización (verificado en `IncidentClaimService`).
4. Cambia `status` a `in_progress`, setea `claimed_by` y `claimed_at`.
5. Genera notificación al creador.

##### RF-FUNC-010: Liberar Incidencia (Release)

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-010 |
| **Prioridad** | Media |

**Reglas:**

1. Solo el OperadorOrg que tiene `claimed_by == user.id`.
2. Cambia `status` a `pending_operator`, limpia `claimed_by` y `claimed_at`.

#### Confirmación de Resolución — NUEVO en v2.0

##### RF-FUNC-011: Confirmar Resolución

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-011 |
| **Prioridad** | Alta |

**Reglas:**

1. Solo `Publicador` cuya `user.organization.incident_category_id == incident.incident_category_id`.
2. El incidente debe estar en `resolved`.
3. **No modifica `status`**: inserta fila en `incident_verifications` con `verifier_user_id`, `incident_id`, `notes`, `created_at`.
4. Genera notificación al OperadorOrg que hizo el claim.

#### Comentarios

##### RF-FUNC-012 a RF-FUNC-014: Sistema de Comentarios

Sin cambios estructurales respecto a v1.0:

- **RF-FUNC-012**: Agregar comentario (1-1000 chars, autor y fecha automáticos, soft delete).
- **RF-FUNC-013**: Listar comentarios (orden cronológico inverso).
- **RF-FUNC-014**: Eliminar comentario (solo autor, soft delete).

#### Ubicación Georreferenciada

##### RF-FUNC-015: Selección de Ubicación

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-015 |
| **Prioridad** | Alta |

Cascada País → Provincia → Ciudad. En v2.0 se agrega **opcionalmente** la captura de coordenadas (`geom` Point) directamente desde el mapa, en cuyo caso se setea la columna PostGIS y se puede usar para queries de proximidad.

##### RF-FUNC-016: Normalización + PostGIS

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-016 |
| **Prioridad** | Alta |

- `locations` con jerarquía `parent_id` (país/provincia/ciudad) + `geom` opcional.
- `incidents.geom` Point (PostGIS) opcional pero recomendado.
- SRID 4326 (WGS84).

#### Clasificación

##### RF-FUNC-017: Selección de Categoría/Subcategoría

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-017 |
| **Prioridad** | Alta |

Cascada: Categoría → Subcategoría (opcional). En v2.0 la subcategoría es opcional y se modela con `incident_categories.parent_id`.

##### RF-FUNC-018: Categorías Predefinidas

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-018 |
| **Prioridad** | Alta |

Sin cambios estructurales. Pre-cargadas vía `IncidentCategorySeeder`.

#### Notificaciones

##### RF-FUNC-019: Eventos que Generan Notificaciones

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-019 |
| **Prioridad** | Media |

| Evento | Destinatario |
|---|---|
| Creación de incidencia | OperadoresOrg de la misma org |
| Claim | Creador de la incidencia |
| Release | Creador de la incidencia |
| Comentario nuevo | Creador + OperadorOrg que claimó |
| Confirmación | OperadorOrg que claimó |

Generadas por `IncidentNotificationObserver` ante eventos Eloquent.

##### RF-FUNC-020: Gestión de Notificaciones

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-020 |
| **Prioridad** | Media |

Endpoints descritos en RF-SW-004.

#### Dashboard y Métricas

##### RF-FUNC-021: Métricas Generales

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-021 |
| **Prioridad** | Alta |

`GET /api/incidents/stats` devuelve: total, por estado, por categoría, tiempo promedio de resolución, distribución por organización (solo SystemAdmin).

##### RF-FUNC-022: Visualización de Gráficos

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-022 |
| **Prioridad** | Alta |

Gráficos de barras (por estado, por categoría) y torta (distribución porcentual).

##### RF-FUNC-023: Filtros de Dashboard

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-023 |
| **Prioridad** | Alta |

Rango de fechas, categoría, prioridad, ubicación, organización (solo SystemAdmin).

#### Autenticación

##### RF-FUNC-024: Login

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-024 |
| **Prioridad** | Alta |

`POST /api/login` con email + password; devuelve `access_token` y `refresh_token`.

##### RF-FUNC-025: Logout

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-025 |
| **Prioridad** | Alta |

`POST /api/logout` con JWT vigente; invalida el token.

##### RF-FUNC-026: Refresh de Token

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-026 |
| **Prioridad** | Alta |

`POST /api/auth/refresh` con refresh token vigente; emite nuevo access token.

#### Consultas y Filtros

##### RF-FUNC-027: Búsqueda por Texto

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-027 |
| **Prioridad** | Media |

Búsqueda parcial (`LIKE %texto%`) en `title` y `description`, case-insensitive.

##### RF-FUNC-028: Filtros Avanzados

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-028 |
| **Prioridad** | Media |

Filtros combinables: `status`, `priority`, `incident_category_id` (cascada con subcategoría), ubicación jerárquica, rango de fechas, `claimed_by`.

#### Nuevos Requisitos v2.0 (RF-FUNC-029 a RF-FUNC-035)

##### RF-FUNC-029: Tracking de Operador (Heartbeat Geográfico)

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-029 |
| **Prioridad** | Media |

`POST /api/operator/location` con `lat`, `lng`, opcional `accuracy`. Se registra con timestamp. No audita cambios históricos (solo última posición conocida por operador). Útil para dispatch.

##### RF-FUNC-030: Menú Dinámico por Rol

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-030 |
| **Prioridad** | Alta |

`GET /api/menus/my` devuelve los items de menú habilitados para el rol del usuario autenticado, con jerarquía opcional. Permite agregar/quitar opciones sin redeploy.

##### RF-FUNC-031: Scoping Multitenant

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-031 |
| **Prioridad** | Alta |

Toda query sobre `incidents`, `users`, `organizations` desde OperadorOrg o Publicador filtra automáticamente por `user.organization_id`. SystemAdmin no filtra. Implementado en `IncidentPolicy` + middleware + Eloquent global scopes donde aplique.

##### RF-FUNC-032: Verificaciones de Resolución (Incident Verifications)

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-032 |
| **Prioridad** | Alta |

Tabla `incident_verifications` con `incident_id`, `verifier_user_id`, `notes`, `created_at`, `deleted_at` (soft delete). Una incidencia puede tener múltiples verificaciones (historial). Visible en `GET /api/incidents/{id}`.

##### RF-FUNC-033: Control de `max_active_claims`

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-033 |
| **Prioridad** | Alta |

`organizations.max_active_claims` limita cuántas puede tener simultáneamente un OperadorOrg. Validado en `IncidentClaimService::claim` antes de aceptar la operación. Devuelve 422 con mensaje claro si se excede.

##### RF-FUNC-034: Sincronización Redis

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-034 |
| **Prioridad** | Media |

Listener `RedisIncidentSync` escucha eventos de creación/actualización/eliminación de incidencias y publica en canal Redis. Permite sincronizar entre múltiples instancias de Frankenphp/Octane y prepara el terreno para push en tiempo real (no usado por frontend en v2.0).

##### RF-FUNC-035: Auditoría Inmutable por Trigger

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-035 |
| **Prioridad** | Alta |

Trigger PostgreSQL sobre `incidents` inserta en `status_history` ante cada cambio de `status`, extrayendo el `user_id` del JWT del request (vía variable de sesión). Garantiza que ningún código de aplicación pueda saltarse la auditoría, incluso si la lógica de aplicación es comprometida.

### 3.3 Requisitos de Rendimiento

| ID | Requisito | Criterio |
|---|---|---|
| RR-001 | Tiempo de respuesta de páginas | < 2 s |
| RR-002 | Tiempo de respuesta de API | < 500 ms para CRUD simple (Octane en memoria) |
| RR-003 | Carga de dashboard | < 3 s |
| RR-004 | Tiempo de búsqueda | < 2 s |
| RR-005 | Concurrentes | ≥ 20 usuarios sin degradación |
| RR-006 | Queries geoespaciales | < 200 ms con índice GIST sobre `incidents.geom` |

### 3.4 Requisitos de Fiabilidad

| ID | Requisito | Criterio |
|---|---|---|
| RF-001 | Disponibilidad | 99% uptime |
| RF-002 | Integridad de datos | 0% pérdida por errores del sistema |
| RF-003 | Recuperación | Restauración completa en ≤ 30 min |
| RF-004 | Persistencia | Datos persistentes entre reinicios |

### 3.5 Requisitos de Disponibilidad

| ID | Requisito | Criterio |
|---|---|---|
| RD-001 | Operación | 24/7 |
| RD-002 | Mantenimiento | Aviso con 48 h de anticipación |
| RD-003 | Mensajes de error | Claros y útiles |

### 3.6 Requisitos de Seguridad

| ID | Requisito | Criterio |
|---|---|---|
| RS-001 | Contraseñas | Hash con bcrypt/argon2 |
| RS-002 | Inyección SQL | Prepared statements (Eloquent) |
| RS-003 | XSS | Escape de HTML en frontend |
| RS-004 | CSRF | Cookies SameSite=Strict (no aplica a JWT puro) |
| RS-005 | CORS | Whitelist de orígenes |
| RS-006 | JWT | Access token con expiración ≤ 60 min, refresh token ≤ 30 días |
| RS-007 | Scoping | Aislamiento multitenant verificado en policies |
| **RS-008** | **Auditoría inmutable** | **Trigger de DB garantiza inserción automática en `status_history`** |

### 3.7 Requisitos de Mantenibilidad

| ID | Requisito | Criterio |
|---|---|---|
| RM-001 | Código documentado | PHPDoc en clases de dominio |
| RM-002 | Estilo de código | PSR-12 con Laravel Pint |
| RM-003 | Arquitectura | DDD con 13 dominios separados |
| RM-004 | Logs | Registro de errores y eventos |
| RM-005 | Tests | Pest (backend) + Vitest (frontend), CI en GitHub Actions |

### 3.8 Requisitos de Portabilidad

| ID | Requisito | Criterio |
|---|---|---|
| RP-001 | Contenedores | Docker + Docker Compose |
| RP-002 | BD | PostgreSQL 15 (PostGIS como dependencia obligatoria) |
| RP-003 | Navegadores | Chrome, Firefox, Safari, Edge recientes |

### 3.9 Otros Requisitos

| ID | Requisito | Criterio |
|---|---|---|
| RO-001 | Responsividad | Adaptable a desktop, tablet, móvil |
| RO-002 | Accesibilidad | Contraste adecuado, fuentes legibles |
| RO-003 | Internacionalización | UI en español, fechas `dd/mm/aaaa` |

---

## 4. Modelo de Datos

### 4.1 Entidades Principales

#### 4.1.1 User

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | Identificador |
| organization_id | BIGINT (FK) | Sí | Tenant (nullable solo para SystemAdmin) |
| name | VARCHAR | No | Nombre |
| email | VARCHAR | No | Único |
| password | VARCHAR | No | Hash bcrypt/argon2 |
| role_id | BIGINT (FK) | No | Rol del usuario |
| timestamps | TIMESTAMP | No | |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.2 Organization

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| name | VARCHAR | No | |
| location_id | BIGINT (FK) | Sí | Ubicación principal de la org |
| parent_id | BIGINT (FK) | Sí | Organización padre (jerarquía) |
| incident_category_id | BIGINT (FK) | Sí | Categoría que esta org atiende (usada por `Publicador` para `confirm`) |
| max_active_claims | INT | No | Máximo de claims simultáneos por OperadorOrg de esta org |
| timestamps | TIMESTAMP | No | |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.3 Incident

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| incident_category_id | BIGINT (FK) | No | Categoría |
| organization_id | BIGINT (FK) | No | Tenant |
| user_id | BIGINT (FK) | No | Creador |
| location_id | BIGINT (FK) | No | Ubicación normalizada |
| title | VARCHAR(100) | No | |
| description | TEXT | No | |
| status | ENUM (`pending`,`pending_operator`,`in_progress`,`resolved`) | No | Default: `pending` |
| priority | ENUM (`low`,`medium`,`high`) | No | |
| resolution_date | TIMESTAMP | Sí | Set al pasar a `resolved` |
| geom | Point (PostGIS) | Sí | Coordenadas geográficas |
| images | JSON/ARRAY | Sí | Lista de paths/URLs |
| claimed_by | BIGINT (FK User) | Sí | OperadorOrg que hizo claim |
| claimed_at | TIMESTAMP | Sí | |
| timestamps | TIMESTAMP | No | |
| deleted_at | TIMESTAMP | Sí | Soft delete |

**Constraints:** CHECK sobre `status`; índice GIST sobre `geom`; índices FK sobre `organization_id`, `incident_category_id`, `claimed_by`.

#### 4.1.4 IncidentCategory

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| name | VARCHAR | No | |
| parent_id | BIGINT (FK) | Sí | Subcategoría (nullable = raíz) |
| timestamps | TIMESTAMP | No | |

#### 4.1.5 Location

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| name | VARCHAR | No | |
| parent_id | BIGINT (FK) | Sí | País → Provincia → Ciudad |
| geom | Point (PostGIS) | Sí | Opcional |
| timestamps | TIMESTAMP | No | |

#### 4.1.6 Comment

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| incident_id | BIGINT (FK) | No | |
| user_id | BIGINT (FK) | No | Autor |
| body | TEXT | No | |
| timestamps | TIMESTAMP | No | |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.7 StatusHistory (inmutable, alimentada por trigger)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| incident_id | BIGINT (FK) | No | |
| previous_status | VARCHAR | Sí | |
| new_status | VARCHAR | No | |
| changed_by_user_id | BIGINT (FK) | No | Extraído del JWT por el trigger |
| created_at | TIMESTAMP | No | |

#### 4.1.8 IncidentVerification

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| incident_id | BIGINT (FK) | No | |
| verifier_user_id | BIGINT (FK) | No | Publicador |
| notes | TEXT | Sí | |
| timestamps | TIMESTAMP | No | |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.9 Notification

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| user_id | BIGINT (FK) | No | Destinatario |
| type | VARCHAR | No | `asignacion`, `cambio_estado`, `comentario`, `confirmacion` |
| title | VARCHAR | No | |
| message | TEXT | No | |
| incident_id | BIGINT (FK) | No | |
| read_at | TIMESTAMP | Sí | Null = no leída |
| timestamps | TIMESTAMP | No | |

#### 4.1.10 Role + Permission + Menu (RBAC)

- `roles`: `id`, `name` (e.g. `SystemAdmin`, `OperadorOrganizacion`, `Publicador`), `timestamps`.
- `permissions`: `id`, `name`, `timestamps`.
- `role_permissions`: pivot.
- `menus`: `id`, `name`, `route` (nullable), `parent_id`, `role_id` o `permission_id`, `timestamps`.

#### 4.1.11 OperatorLocation (tracking)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| id | BIGINT (PK) | No | |
| user_id | BIGINT (FK) | No | OperadorOrg |
| geom | Point (PostGIS) | No | |
| accuracy | FLOAT | Sí | |
| created_at | TIMESTAMP | No | |

### 4.2 Diagrama de Relaciones (ER)

```
┌─────────────┐
│  SystemAdmin │ (implícito por bypass)
└─────────────┘
       │
       ▼
┌─────────────┐       ┌─────────────────┐       ┌──────────────┐
│    User     │       │   Organization  │       │     Role     │
│─────────────│       │─────────────────│       │──────────────│
│ PK id       │       │ PK id           │       │ PK id        │
│ FK org_id   │◄──────│ FK parent_id    │       │ name         │
│ FK role_id  │       │    name         │       └──────┬───────┘
│    email    │       │ FK location_id  │              │
│    password │       │ FK category_id  │              │ M:N
└──────┬──────┘       │ max_active_claims│       ┌──────┴───────┐
       │              └──────────────────┘       │ Permission   │
       │ 1:N                                    └──────────────┘
       ▼
┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Incident   │   │ IncidentCategory │   │  IncidentVerif.  │
│─────────────│   │──────────────────│   │──────────────────│
│ PK id       │   │ PK id            │   │ PK id            │
│ title       │   │ name             │   │ FK incident_id   │
│ description │   │ FK parent_id     │   │ FK verifier_id   │
│ status (CK) │   └──────────────────┘   │ notes            │
│ priority    │            ▲              │ deleted_at       │
│ FK org_id   │            │              └──────────────────┘
│ FK user_id  │            │
│ FK cat_id   ├────────────┘
│ FK loc_id   │            ┌──────────────────┐
│ geom (GIST) │◄──────────►│     Location     │
│ claimed_by  │            │──────────────────│
│ claimed_at  │            │ PK id            │
│ images      │            │ name             │
└──────┬──────┘            │ FK parent_id     │
       │ 1:N               │ geom (GIST)      │
       │                   └──────────────────┘
       ├──────────┬────────────┬───────────────┐
       ▼          ▼            ▼               ▼
┌──────────┐ ┌────────┐ ┌────────────┐ ┌──────────────────┐
│ Comment  │ │ Status │ │ Operator   │ │   Notification   │
│          │ │ History│ │ Location   │ │                  │
│ body     │ │(TRIG)  │ │ geom       │ │ type, read_at    │
└──────────┘ └────────┘ └────────────┘ └──────────────────┘
```

---

## 5. Apéndices

### 5.1 Matriz de Trazabilidad

| Requisito | Tipo | Prioridad | Módulo | Caso de Prueba |
|---|---|---|---|---|
| RF-FUNC-001 | Funcional | Alta | Incidents | `IncidentFieldLockTest`, `IncidentImageTest` |
| RF-FUNC-002 | Funcional | Alta | Incidents | (cubierto por `IncidentRepositoryRelationsTest`) |
| RF-FUNC-003 | Funcional | Alta | Incidents | (id.) |
| RF-FUNC-004 | Funcional | Alta | Incidents | `IncidentFieldLockTest` |
| RF-FUNC-005 | Funcional | Media | Incidents | (soft delete vía global scope) |
| RF-FUNC-006 | Funcional | Alta | Incidents | `IncidentStatusTest` |
| RF-FUNC-007 | Funcional | Alta | Incidents | `IncidentStatusTest` |
| RF-FUNC-008 | Funcional | Alta | Incidents | (cubierto por trigger de DB) |
| RF-FUNC-009 | Funcional | Alta | Incidents | `RedisIncidentSyncTest` (parte del flujo) |
| RF-FUNC-010 | Funcional | Media | Incidents | (id.) |
| RF-FUNC-011 | Funcional | Alta | Incidents | (a crear) |
| RF-FUNC-012 | Funcional | Alta | Comments | `CommentControllerTest` |
| RF-FUNC-013 | Funcional | Alta | Comments | (id.) |
| RF-FUNC-014 | Funcional | Media | Comments | (id.) |
| RF-FUNC-015 | Funcional | Alta | Locations | (cubierto por `LocationController` CRUD) |
| RF-FUNC-016 | Funcional | Alta | Locations | (migración PostGIS habilitada) |
| RF-FUNC-017 | Funcional | Alta | IncidentCategories | `IncidentCategorySeeder` |
| RF-FUNC-018 | Funcional | Alta | IncidentCategories | (id.) |
| RF-FUNC-019 | Funcional | Media | Notifications | `NotificationControllerTest` |
| RF-FUNC-020 | Funcional | Media | Notifications | (id.) |
| RF-FUNC-021 | Funcional | Alta | Incidents | `IncidentStatsControllerTest` |
| RF-FUNC-022 | Funcional | Alta | Incidents | (id.) |
| RF-FUNC-023 | Funcional | Alta | Incidents | (id.) |
| RF-FUNC-024 | Funcional | Alta | Auth | `AuthControllerTest`, `AuthFlowTest` |
| RF-FUNC-025 | Funcional | Alta | Auth | (id.) |
| RF-FUNC-026 | Funcional | Alta | Auth | `JwtServiceTest` |
| RF-FUNC-027 | Funcional | Media | Incidents | (cubierto por listado) |
| RF-FUNC-028 | Funcional | Media | Incidents | (id.) |
| **RF-FUNC-029** | Funcional | Media | OperatorLocation | `OperatorLocationControllerTest`, `OperatorTrackingTest` |
| **RF-FUNC-030** | Funcional | Alta | Menus | `MenuSeeder` |
| **RF-FUNC-031** | Funcional | Alta | Cross-domain | `TenantScopingTest` |
| **RF-FUNC-032** | Funcional | Alta | Incidents | (cubierto por `IncidentVerificationService`) |
| **RF-FUNC-033** | Funcional | Alta | Incidents | `UserCreationPolicyTest` (parte) |
| **RF-FUNC-034** | Funcional | Media | Incidents | `RedisIncidentSyncTest` |
| **RF-FUNC-035** | No funcional | Alta | DB | (cubierto por trigger, sin test unit) |
| RS-001 | Seguridad | Alta | Auth | bcrypt/argon2 en migraciones |
| RS-002 | Seguridad | Alta | Backend | Eloquent siempre |
| RS-003 | Seguridad | Alta | Frontend | escape manual |
| RS-006 | Seguridad | Alta | Auth | `JwtServiceTest` |
| **RS-008** | Seguridad | Alta | DB | trigger de DB |
| RM-005 | Mantenibilidad | Media | CI | `.github/workflows/ci.yml` |

### 5.2 Glosario

Ver sección 1.3 para definiciones, acrónimos y abreviaturas. Términos adicionales:

| Término | Definición |
|---|---|
| **Bypass** | Capacidad de un rol (SystemAdmin) para saltarse el scoping multitenant. |
| **Claim / Release** | Acciones para tomar y liberar responsabilidad sobre una incidencia. Reemplazan la asignación rígida de v1.0. |
| **Frankenphp** | Servidor de aplicaciones PHP escrito en Go, basado en Caddy, con soporte de HTTP/3 y early hints. |
| **Heartbeat** | Reporte periódico (en este caso, geográfico) de un cliente al servidor. |
| **Octane** | Capa de Laravel que sirve la app desde memoria compartida entre requests (alta performance). |
| **Shallow nesting** | Convención REST: prefijo de colección pero no de recurso en rutas anidadas. |
| **Soft delete** | Eliminación lógica con `deleted_at`; el registro no se borra físicamente. |
| **Tenant** | Organización lógica dueña de un conjunto de datos. En este sistema, una `Organization`. |

### Apéndice A: SRS v1.0 (versión histórica)

> El contenido íntegro de la versión **v1.0** del SRS (08/06/2026) se preserva en el archivo [`SRS-v1.0.md`](./SRS-v1.0.md) sin modificaciones, como referencia de la visión original del proyecto.
>
> Las divergencias entre v1.0 y la implementación actual (v2.0) están documentadas en el resumen ejecutivo al inicio de este documento.
>
> Este apéndice existe para:
> 1. Trazabilidad histórica (qué se pensó vs qué se construyó).
> 2. Cumplimiento de requisitos académicos (la cátedra pidió el SRS como entregable).
> 3. Onboarding de nuevos integrantes que necesiten entender la génesis del proyecto.

---

## Información del Documento

| Atributo | Valor |
|---|---|
| **Título** | Especificación de Requisitos de Software (SRS) |
| **Proyecto** | Sistema Web de Gestión de Incidencias Georreferenciadas |
| **Versión** | 2.0 |
| **Fecha** | 07 de julio de 2026 |
| **Versión anterior** | v1.0 — [`SRS-v1.0.md`](./SRS-v1.0.md) |
| **Autores** | Equipo de Proyecto |
| **Estado** | Sincronizado con implementación actual |
| **Referencias** | IEEE 830-1998, ISO/IEC 25000, ISO/IEC 25010 |

---

*Documento elaborado siguiendo el estándar IEEE 830 para Especificación de Requisitos de Software.*
