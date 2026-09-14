# Spec: GET /api/roles/stats

> **Endpoint**: `GET /api/roles/stats`
> **Permiso**: `READ` (universal para admins — mismo que `GET /api/roles`)
> **Sin request body**

---

## Requirements

### Requirement: Endpoint expone 3 métricas agregadas

El sistema MUST responder con un objeto JSON que contiene
`totalPermissions`, `protectedModules` y `assignedUsers`,
calculados a partir de las filas vivas (no soft-deleted) de
`roles` y `users`.

#### Scenario: Happy path con datos sembrados

- **GIVEN** hay 5 roles vivos con un total de 124 strings de
  permission únicos (12 recursos distintos)
- **AND** hay 85 users vivos con `roleId IS NOT NULL`
- **WHEN** `GET /api/roles/stats` con `READ` permission
- **THEN** retorna 200 con:
  ```json
  {
    "totalPermissions": 124,
    "protectedModules": 12,
    "assignedUsers": 85
  }
  ```

#### Scenario: Sin roles vivos

- **GIVEN** no hay roles (o todos están soft-deleted)
- **WHEN** `GET /api/roles/stats`
- **THEN** retorna 200 con:
  ```json
  {
    "totalPermissions": 0,
    "protectedModules": 0,
    "assignedUsers": 0
  }
  ```

#### Scenario: Roles sin permissions (totalPermissions 0)

- **GIVEN** hay 3 roles con `permissions = []`
- **WHEN** `GET /api/roles/stats`
- **THEN** retorna 200 con:
  ```json
  {
    "totalPermissions": 0,
    "protectedModules": 0,
    "assignedUsers": 3
  }
  ```
  (assignedUsers = usuarios con role_id apuntando a esos roles)

#### Scenario: Permission string duplicado entre roles cuenta una vez

- **GIVEN** rol A tiene `permissions: ['READ users']`
- **AND** rol B tiene `permissions: ['READ users', 'UPDATE incidents']`
- **WHEN** `GET /api/roles/stats`
- **THEN** `totalPermissions = 2` (no 3 — el duplicado colapsa)
- **AND** `protectedModules = 2` (`users` + `incidents`)

---

### Requirement: Soft-deleted rows excluidas

El sistema MUST excluir roles y users con `deletedAt IS NOT NULL`
del cálculo.

#### Scenario: Rol soft-deleted excluido

- **GIVEN** rol A (vivo) tiene `permissions: ['READ users']`
- **AND** rol B (soft-deleted) tiene `permissions: ['UPDATE
  users', 'DELETE users']`
- **WHEN** `GET /api/roles/stats`
- **THEN** `totalPermissions = 1` (sólo A cuenta)
- **AND** `protectedModules = 1`

#### Scenario: User soft-deleted excluido de assignedUsers

- **GIVEN** user-1 (vivo) tiene `roleId = role-1`
- **AND** user-2 (soft-deleted) tiene `roleId = role-1`
- **WHEN** `GET /api/roles/stats`
- **THEN** `assignedUsers = 1` (sólo user-1 cuenta)

#### Scenario: User con roleId null NO cuenta

- **GIVEN** user-1 (vivo) tiene `roleId = NULL`
- **AND** user-2 (vivo) tiene `roleId = role-1`
- **WHEN** `GET /api/roles/stats`
- **THEN** `assignedUsers = 1` (sólo user-2 con rol asignado)

---

### Requirement: Permission string se parsea como "ACTION resource"

El sistema MUST parsear cada string de permission con el formato
`"ACTION resource"` (T3.1, fijado desde 0009_roles_permissions.sql).
La parte resource es la que cuenta para `protectedModules`.

#### Scenario: Resource extraído correctamente

- **GIVEN** rol A tiene `permissions: ['READ users', 'CREATE
  incidents', 'UPDATE roles']`
- **WHEN** `GET /api/roles/stats`
- **THEN** `protectedModules = 3` (users, incidents, roles)

#### Scenario: Permission string mal formado se ignora

- **GIVEN** rol A tiene `permissions: ['READ users', 'malformed',
  'UPDATE incidents']`
- **WHEN** `GET /api/roles/stats`
- **THEN** `totalPermissions = 2` (malformed NO cuenta)
- **AND** `protectedModules = 2` (users, incidents)

---

### Requirement: Permiso READ requerido

El sistema MUST requerir el permiso `READ` (sin recurso, igual
que `GET /api/roles`).

#### Scenario: Actor sin READ retorna 403

- **GIVEN** un usuario sin `READ` permission
- **WHEN** `GET /api/roles/stats`
- **THEN** retorna 403 (PermissionGuard)

#### Scenario: Master o admin_org pueden ver stats

- **GIVEN** un usuario con `READ` permission (master o
  admin_org, después de T7.9.B ambos lo tienen)
- **WHEN** `GET /api/roles/stats`
- **THEN** retorna 200 con los datos

---

## Out of Scope

- Cache con TTL — el cálculo es barato.
- Stats por organización — sólo globales en F6.
- Más métricas (roles sin uso, custom vs seeded, distribución).
- Endpoint de drill-down (ej. `GET /api/roles/stats/users`) —
  no pedido por mock 04-01.
- Mutations a través de este endpoint — es read-only.
