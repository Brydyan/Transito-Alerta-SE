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
| Framework backend | **Laravel 12.x** sobre **Frankenphp/Octane** |
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

El sistema consistirá en una aplicación web completa que permitirá:

- El registro, gestión y seguimiento completo de **incidencias georreferenciadas** (con coordenadas PostGIS y dirección normalizada País → Provincia → Ciudad).
- La **toma de responsabilidad** sobre una incidencia mediante la acción `claim` (reemplaza la asignación rígida de v1.0).
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
- Verificación por Publicador (Opción B simplifica: resolver = resuelto inmediatamente).

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
| **Frankenphp** | Servidor de aplicaciones PHP moderno basado en Caddy; usado con Laravel Octane. |
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
- **Capa de Lógica de Negocio (Backend)**: API REST en **Laravel 12** corriendo sobre **Frankenphp/Octane**. Organizada en 13 dominios DDD.
- **Capa de Datos**: **PostgreSQL 15** con extensión **PostGIS**. Redis como cache y bus.

### 2.2 Funcionalidades del Producto

1. **Gestión de Incidencias**: CRUD completo con upload de imágenes (multipart) y coordenadas geográficas.
2. **Máquina de Estados**: Transiciones controladas con auditoría inmutable vía trigger de DB. **3 estados (v3.0):** pending → in_progress → resolved.
3. **Toma y Liberación de Responsabilidad**: `claim`/`release` por OperadorOrg con control de concurrencia (`max_active_claims`).
4. **Sistema de Comentarios**: Anidados shallow por incidencia, con soft delete.
5. **Ubicación Georreferenciada**: Coordenadas PostGIS + dirección normalizada jerárquica.
6. **Clasificación Jerárquica**: Categoría con subcategoría opcional (autorreferencia `parent_id`).
7. **Notificaciones**: Generadas por Observer Eloquent ante eventos relevantes.
8. **Menú Dinámico por Rol**: El frontend pide `GET /menus/my` y renderiza solo lo permitido.
9. **Tracking de Operadores**: Endpoint de heartbeat geográfico.
10. **Dashboard y Métricas**: Conteos por estado, por tipo, por org; tiempo promedio de resolución.
11. **Scoping Multitenant**: Aislamiento automático por organización para OperadorOrg; bypass para SystemAdmin.
12. **Sincronización en Tiempo Real**: Redis pub/sub vía `RedisIncidentSync` listener.

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

#### 2.3.3 ~~Visitante (sin autenticación)~~ — rol retirado

Ya no existe acceso anónimo al sistema. Toda ruta exige JWT.

*(Nota: Rol Publicador removido en v3.0. Ver RFC-FUNC-011 en sección 3.2)*

### 2.4 Ambiente Operativo

*(Idéntico a v2.0)*

### 2.5 Restricciones de Diseño e Implementación

| Restricción | Descripción |
|---|---|
| Backend | Laravel (API REST en PHP) — obligatorio |
| Frontend | HTML5, CSS3, Bootstrap, JavaScript — obligatorio |
| Base de datos | PostgreSQL con PostGIS — obligatorio |
| Autenticación | JWT (stateless) — obligatorio |
| Despliegue | Contenedores Docker con Docker Compose — obligatorio |
| Auditoría | `status_history` por trigger de DB (no por código) |
| **Estados** | **3 estados: pending, in_progress, resolved (v3.0)** |

### 2.6 Suposiciones y Dependencias

*(Idénticas a v2.0)*

---

## 3. Requisitos Específicos

### 3.1 Requisitos de Interfaces Externas

*(La mayoría idéntica a v2.0. Cambios significativos:)*

#### 3.1.1 Interfaces de Usuario (cambios en RF-UI-002 y RF-UI-004)

**RF-UI-002 (Dashboard):** Scope = SystemAdmin ve todo; OperadorOrg ve solo su org. ~~Publicador~~ removido.

**RF-UI-004 (Detalle de Incidencia):**
- Badge de estado: `pending`, `in_progress`, `resolved` *(v3.0: removido `pending_operator`)*
- Acciones según rol:
  - OperadorOrg: `claim`, `release`, editar
  - SystemAdmin: todo
  - ~~Publicador: confirmar~~ *(removido en v3.0)*

#### 3.1.3 Interfaces de Software (API) — cambios en RF-SW-002

**RF-SW-002 (Incidencias CRUD + acciones):**

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/incidents/{id}/claim` | OperadorOrg toma incidencia |
| POST | `/api/incidents/{id}/release` | OperadorOrg libera incidencia |
| ~~POST~~ | ~~`/api/incidents/{id}/confirmar`~~ | **~~Removido en v3.0~~** |

---

### 3.2 Requisitos Funcionales

#### Cambios RF-FUNC en v3.0

**RF-FUNC-006: Estados Disponibles**

| Valor DB | Localización UI | Significado |
|---|---|---|
| `pending` | Pendiente | Recién creada o liberada por operador |
| `in_progress` | En proceso | Un OperadorOrg hizo `claim` |
| `resolved` | Resuelta | El OperadorOrg marcó el trabajo como terminado |

**3 estados totales.** Constraint CHECK en PostgreSQL garantiza validez.

---

**RF-FUNC-010: Liberar Incidencia (Release)**

| Atributo | Detalle |
|---|---|
| **ID** | RF-FUNC-010 |
| **Prioridad** | Media |

**Reglas:**

1. Solo el OperadorOrg que tiene `claimed_by == user.id`.
2. Cambia `status` a `pending` *(v3.0: NO a `pending_operator`)*, limpia `claimed_by` y `claimed_at`.

---

**RF-FUNC-011: ~~Confirmar Resolución~~ — REMOVIDO EN V3.0**

Este requisito fue removido. En v2.0 especificaba un endpoint POST `/api/incidents/{id}/confirmar` con rol Publicador.

**Razón de eliminación:** La implementación simplificó el modelo a 3 estados. Publicador era innecesario para el flujo core.

**Si auditoría de resoluciones es crítica:** Considerar Opción C (resolution_audits table con observer pattern).

---

**RF-FUNC-031: Scoping Multitenant**

Toda query desde OperadorOrg filtra automáticamente por `user.organization_id`. ~~Publicador~~ removido.

---

**RF-FUNC-032: ~~Verificaciones de Resolución~~ — REMOVIDO EN V3.0**

Este requisito fue removido. En v2.0 especificaba tabla `incident_verifications`.

**Razón de eliminación:** Sin Publicador role, no hay acción `confirm`. Tabla no tiene propósito.

---

**RF-FUNC-033 → RF-FUNC-032 (Control de `max_active_claims`)** — renumerado

| Atributo | Detalle |
|---|---|
| **ID** | **RF-FUNC-032** (antes 033) |
| **Prioridad** | Alta |

`organizations.max_active_claims` limita claims simultáneos por OperadorOrg.

---

**RF-FUNC-034 → RF-FUNC-033 (Sincronización Redis)** — renumerado

| Atributo | Detalle |
|---|---|
| **ID** | **RF-FUNC-033** (antes 034) |
| **Prioridad** | Media |

Listener `RedisIncidentSync` escucha eventos de incidencias.

---

**RF-FUNC-035 → RF-FUNC-034 (Auditoría Inmutable por Trigger)** — renumerado

| Atributo | Detalle |
|---|---|
| **ID** | **RF-FUNC-034** (antes 035) |
| **Prioridad** | Alta |

Trigger PostgreSQL inserta en `status_history` ante cambios de `status`.

---

### 3.3–3.9 Otros Requisitos

*(Idénticos a v2.0. Solo cambio: "Publicador" → "OperadorOrg", "confirm" → removido)*

---

## 4. Modelo de Datos

### 4.1 Entidades Principales

#### 4.1.3 Incident (cambios en v3.0)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| status | ENUM (`pending`,`in_progress`,`resolved`) | No | **3 valores en v3.0** *(removido `pending_operator`)* |

*(Resto idéntico a v2.0)*

---

#### 4.1.8 ~~IncidentVerification~~ — REMOVIDO EN V3.0

Tabla eliminada. No hay verificaciones de resolución.

---

#### 4.1.9 Notification (actualizado)

| Campo | Tipo | Nullable | Descripción |
|---|---|---|---|
| type | VARCHAR | No | `asignacion`, `cambio_estado`, `comentario` *(removido `confirmacion`)* |

---

#### 4.1.10 Role + Permission + Menu (actualizado)

- `roles`: `id`, `name` (e.g. `SystemAdmin`, `OperadorOrganizacion`) — **removido `Publicador`**
- `permissions`: idem v2.0
- `role_permissions`: pivot
- `menus`: idem v2.0

---

### 4.2 Diagrama de Relaciones (ER) — actualizado

```
[Diagrama removido: IncidentVerification node eliminado]
```

---

## 5. Apéndices

### 5.1 Matriz de Trazabilidad (ACTUALIZADA)

*(Removidas líneas de RF-FUNC-011 y RF-FUNC-032; renumeradas 032–034)*

| Requisito | Tipo | Prioridad | Módulo |
|---|---|---|---|
| RF-FUNC-001–010 | Funcional | Alta | Incidents |
| ~~RF-FUNC-011~~ | ~~Funcional~~ | ~~Alta~~ | ~~(Confirmar — REMOVIDO)~~ |
| RF-FUNC-011–028 | Funcional | Media–Alta | Comments, Locations, etc. |
| RF-FUNC-029–031 | Funcional | Media–Alta | OperatorLocation, Menus, Scoping |
| **RF-FUNC-032** | Funcional | Alta | Incidents *(antes 033)* |
| **RF-FUNC-033** | Funcional | Media | Incidents *(antes 034)* |
| **RF-FUNC-034** | No funcional | Alta | DB *(antes 035)* |

**Total requisitos funcionales: 33** (v3.0) vs 35 (v2.0)

---

### 5.2 Glosario

*(Idéntico a v2.0, excluida definición de "Publicador")*

---

### Apéndice A: SRS v2.0 (versión anterior)

El contenido íntegro de **v2.0** se preserva en [`SRS.md`](./SRS.md) como referencia de la visión previa (4 estados + Publicador).

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

## Notas Finales — Opción B

**¿Por qué Opción B?**

- ✅ Spec sincronizada con realidad
- ✅ Cero impacto técnico (cambio documental)
- ✅ Seguro para presentación (04 May 2026)
- ✅ Claridad: E1 ahora describe fielmente lo construido
- ⚠️ Sin auditoría de resoluciones (si crítica, usar Opción C)

**Alternativa: Opción C (resolution_audits lightweight)**

Si auditoría de resoluciones es requerida post-presentation, implementar TAREA_11 (resolution_audits table con observer pattern). Costo: 2-3 horas, impacto mínimo.

---

*Documento elaborado siguiendo el estándar IEEE 830 para Especificación de Requisitos de Software. Alineado con arquitectura real implementada (3-state workflow, multitenant, claim/release pattern).*

**Opción B: Simplificación y Alineación para Estabilidad en Presentación.**
