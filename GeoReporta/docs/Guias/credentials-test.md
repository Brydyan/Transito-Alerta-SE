# Credenciales de Prueba (Multitenant & RBAC)

Este documento contiene las cuentas de prueba disponibles para interactuar con el sistema de incidencias georreferenciadas según las organizaciones sembradas en la base de datos y sus respectivos roles.

Fuente de verdad: `backend/database/seeders/UserSeeder.php` (llamado desde `DatabaseSeeder`, `php artisan db:seed`).

---

## 1. Cuentas Globales (Sistema)

Estas cuentas tienen alcance global y no pertenecen a ninguna organización específica.

| Rol                      | Correo Electrónico     | Contraseña     | Descripción / Alcance                                               |
| ------------------------ | ----------------------- | -------------- | -------------------------------------------------------------------- |
| **Super Administrador**  | `admin@sistema.com`     | `Admin123!`    | Acceso completo al sistema, organizaciones y todas las incidencias.  |
| **Operador del Sistema** | `operador@sistema.com`  | `Operador123!` | Acceso técnico y operativo general en la plataforma.                 |
| **Ciudadano**            | `usuario@test.com`      | `Usuario123!`  | Reporta incidencias desde el feed. Ve únicamente sus incidencias.    |

---

## 2. Cuentas de Organizaciones (Seeder General)

Creadas por `UserSeeder` — un Administrador y un Operador por cada organización sembrada en `OrganizationSeeder`. Dominio `@organizacion.com`, contraseña fija por rol (`Admin123!` / `Operador123!`).

### 2.1 GAD Municipal del Cantón Quito (Parent)

- **Admin**: `admin.gad-municipal-del-canton-quito@organizacion.com` / `Admin123!`
- **Operador**: `operador.gad-municipal-del-canton-quito@organizacion.com` / `Operador123!`

### 2.2 Sucursales de Quito

- **GAD Quito — Zona Centro**:
  - **Admin**: `admin.gad-quito-zona-centro@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-quito-zona-centro@organizacion.com` / `Operador123!`
- **GAD Quito — Zona Norte**:
  - **Admin**: `admin.gad-quito-zona-norte@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-quito-zona-norte@organizacion.com` / `Operador123!`
- **GAD Quito — Zona Sur**:
  - **Admin**: `admin.gad-quito-zona-sur@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-quito-zona-sur@organizacion.com` / `Operador123!`

### 2.3 GAD Municipal del Cantón Guayaquil (Parent)

- **Admin**: `admin.gad-municipal-del-canton-guayaquil@organizacion.com` / `Admin123!`
- **Operador**: `operador.gad-municipal-del-canton-guayaquil@organizacion.com` / `Operador123!`

### 2.4 Sucursales de Guayaquil

- **GAD Guayaquil — Centro**:
  - **Admin**: `admin.gad-guayaquil-centro@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-guayaquil-centro@organizacion.com` / `Operador123!`
- **GAD Guayaquil — Norte**:
  - **Admin**: `admin.gad-guayaquil-norte@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-guayaquil-norte@organizacion.com` / `Operador123!`

### 2.5 GAD Municipal del Cantón Cuenca (Parent)

- **Admin**: `admin.gad-municipal-del-canton-cuenca@organizacion.com` / `Admin123!`
- **Operador**: `operador.gad-municipal-del-canton-cuenca@organizacion.com` / `Operador123!`

### 2.6 Sucursales de Cuenca

- **GAD Cuenca — Centro**:
  - **Admin**: `admin.gad-cuenca-centro@organizacion.com` / `Admin123!`
  - **Operador**: `operador.gad-cuenca-centro@organizacion.com` / `Operador123!`

### 2.7 GAD Municipal del Cantón Ambato

- **Admin**: `admin.gad-municipal-del-canton-ambato@organizacion.com` / `Admin123!`
- **Operador**: `operador.gad-municipal-del-canton-ambato@organizacion.com` / `Operador123!`

### 2.8 GAD Municipal del Cantón Loja

- **Admin**: `admin.gad-municipal-del-canton-loja@organizacion.com` / `Admin123!`
- **Operador**: `operador.gad-municipal-del-canton-loja@organizacion.com` / `Operador123!`

---

## Notas

- El rol `publicador` y el seeder `MultitenantFeatSeeder` (dominio `@incidencias.com`) fueron eliminados — ver migración `2026_07_08_000002_remove_publicador_role_and_verifications.php`. Cualquier credencial con ese dominio o rol ya no existe.
- `IncidentSeeder` (22 incidentes demo) referencia usuarios (`usuario1@test.com`, `usuario2@test.com`, `operador1@sistema.com`, `operador2@sistema.com`) que **no** crea `UserSeeder` — ese desajuste sigue pendiente, no está resuelto en este documento.
