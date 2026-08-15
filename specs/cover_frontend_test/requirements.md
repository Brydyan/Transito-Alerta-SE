# Requirements: Cobertura de Pruebas Frontend

## System Requirements
1. The frontend test suite must achieve phased line coverage targets across all files in `frontend/js/` (excluyendo `pages/incidencias/`, que se refactoriza en otra rama):
   - **FASE 1: 75%** de cobertura global.
   - **FASE 2: 85%** de cobertura global.
   - **FASE 3 (FINAL): 95%** de cobertura global.
2. Tests must be deterministic and independent of each other.
3. Existing tests must not be broken during the process of adding new ones.

## User Requirements
1. Users expect the frontend behavior to remain stable and unaffected by the addition of tests.
2. Code quality (readability, no code smells, DRY) must be maintained when writing the tests.

## Inventario completo de archivos en `frontend/js/`

> **Nota**: El módulo `pages/incidencias/` queda EXCLUIDO porque está siendo refactorizado en otra rama. Estas son 6 fuentes con sus tests. Total considerando exclusión: **57 source files**, **29 con test existente**, **28 sin test**.

### Núcleo / Core (8 files, 0 con test)
| # | Archivo | Test existente | Prioridad |
|---|---------|---------------|-----------|
| 1 | `app.js` | ❌ Ninguno | Alta |
| 2 | `router.js` | ❌ Ninguno | Alta |
| 3 | `core/api.js` | ❌ Ninguno | Alta |
| 4 | `core/auth.service.js` | ❌ Ninguno | Alta |
| 5 | `core/base-component.js` | ❌ Ninguno | Alta |
| 6 | `core/circuit-breaker.js` | ❌ Ninguno | Alta |
| 7 | `core/echo.js` | ❌ Ninguno | Media |
| 8 | `core/mascot/mascot.component.js` | ❌ Ninguno | Media |

### Shared (9 files, 0 con test)
| # | Archivo | Test existente | Prioridad |
|---|---------|---------------|-----------|
| 9 | `shared/constants.js` | ❌ Ninguno | Alta |
| 10 | `shared/utils/ui-helper.js` | ❌ Ninguno | Alta |
| 11 | `shared/utils/badge-states.js` | ❌ Ninguno | Alta |
| 12 | `shared/services/catalogo.service.js` | ❌ Ninguno | Alta |
| 13 | `shared/services/modal.service.js` | ❌ Ninguno | Alta |
| 14 | `shared/services/toast.service.js` | ❌ Ninguno | Alta |
| 15 | `shared/components/app-data-table/app-data-table.component.js` | ❌ Ninguno | Alta |
| 16 | `shared/components/modal/modal.component.js` | ❌ Ninguno | Alta |
| 17 | `shared/components/toast/toast.component.js` | ❌ Ninguno | Alta |

### Componentes generales (6 files, 0 con test)
| # | Archivo | Test existente | Prioridad |
|---|---------|---------------|-----------|
| 18 | `components/stats-card.js` | ❌ Ninguno | Alta |
| 19 | `components/sidebar/sidebar.component.js` | ❌ Ninguno | Alta |
| 20 | `components/navbar/navbar.component.js` | ❌ Ninguno | Alta |
| 21 | `components/navbar/notification/notification-card.component.js` | ❌ Ninguno | Alta |
| 22 | `components/navbar/notification/notification-tray.component.js` | ❌ Ninguno | Alta |
| 23 | `components/menu-lobby/menu-lobby.component.js` | ❌ Ninguno | Alta |

### Páginas sin test (4 files)
| # | Archivo | Test existente | Prioridad |
|---|---------|---------------|-----------|
| 24 | `pages/signup/signup.component.js` | ❌ Ninguno | Alta |
| 25 | `pages/auth/activate/activate.component.js` | ❌ Ninguno | Alta |
| 26 | `pages/trp-dashboard/trp-dashboard.component.js` | ❌ Ninguno | Media |
| 27 | `pages/instituciones/components/index/institucion-index.component.js` | ❌ Ninguno | Alta |
| 28 | `pages/instituciones/components/form/institucion-form.component.js` | ❌ Ninguno | Alta |

### Páginas con test existente (necesitan mejora) (6 files con < 95%)
| # | Archivo | Test existente | Cobertura actual estimada |
|---|---------|---------------|---------------------------|
| 29 | `pages/user/components/index/user-index.component.js` | `user-index.component.test.js` | < 80% |
| 30 | `pages/user/components/form/user-form.component.js` | `user-form.component.test.js` | < 80% |
| 31 | `pages/ubicaciones/components/territorios/ubicaciones-territorios.component.js` | `ubicaciones-territorios.component.test.js` | ~51% |

### Páginas con test existente (presumiblemente >= 80%) (23 files)
| # | Archivo | Test existente |
|---|---------|---------------|
| 32 | `pages/login/login.component.js` | `login.component.test.js` |
| 33 | `pages/user/services/user.service.js` | `user.service.test.js` |
| 34 | `pages/role/services/role.service.js` | `role.service.test.js` |
| 35 | `pages/role/component/index/role-index.component.js` | `role-index.component.test.js` |
| 36 | `pages/role/component/form/role-form.component.js` | `role-form.component.test.js` |
| 37 | `pages/permissions/services/permissions.service.js` | `permissions.service.test.js` |
| 38 | `pages/permissions/components/index/permission-index.component.js` | `permission-index.component.test.js` |
| 39 | `pages/permissions/components/form/permission-form.component.js` | `permission-form.component.test.js` |
| 40 | `pages/menu-options/services/menu-option.service.js` | `menu-option.service.test.js` |
| 41 | `pages/menu-options/components/menu-options-list/menu-options-list.component.js` | `menu-options-list.component.test.js` |
| 42 | `pages/menu-options/components/menu-options-form/menu-options-form.component.js` | `menu-options-form.component.test.js` |
| 43 | `pages/instituciones/services/institucion.service.js` | `institucion.service.test.js` |
| 44 | `pages/instituciones/components/kanban/kanban-index.component.js` | `kanban-index.component.test.js` |
| 45 | `pages/dashboard/services/dashboard.service.js` | `dashboard.service.test.js` |
| 46 | `pages/dashboard/components/dashboard-index/dashboard.component.js` | `dashboard.component.test.js` |
| 47 | `pages/dashboard/components/dashboard-admin/dashboard-admin.component.js` | `dashboard-admin.component.test.js` |
| 48 | `pages/dashboard/components/dashboard-supervisor/dashboard-supervisor.component.js` | `dashboard-supervisor.component.test.js` |
| 49 | `pages/dashboard/components/dashboard-ciudadano/dashboard-ciudadano.component.js` | `dashboard-ciudadano.component.test.js` |
| 50 | `pages/dashboard/components/dashboard-institucion/dashboard-institucion.component.js` | `dashboard-institucion.component.test.js` |
| 51 | `pages/categorias/services/categoria-incidencia.service.js` | `categoria-incidencia.service.test.js` |
| 52 | `pages/categorias/components/index/categorias-index.component.js` | `categorias-index.component.test.js` |
| 53 | `pages/ubicaciones/services/ubicaciones.service.js` | `ubicaciones.service.test.js` |
| 54 | `pages/ubicaciones/components/index/ubicaciones-index.component.js` | `ubicaciones-index.component.test.js` |
| 55 | `pages/ubicaciones/components/paises/ubicaciones-paises.component.js` | `ubicaciones-paises.component.test.js` |
| 56 | `pages/ubicaciones/components/direcciones/ubicaciones-direcciones.component.js` | `ubicaciones-direcciones.component.test.js` |
| 57 | `pages/ubicaciones/components/direcciones/direccion-form.component.js` | `direccion-form.component.test.js` |

## Criterios de Aceptación
- [ ] Listar todos los archivos en `frontend/js` (excluyendo `pages/incidencias/`) y clasificarlos por estado de cobertura.
- [ ] FASE 1: Escribir tests para archivos sin cobertura hasta alcanzar ≥ 75% global (excluyendo incidencias).
- [ ] FASE 2: Expandir tests existentes y cubrir archivos restantes hasta ≥ 85% global (excluyendo incidencias).
- [ ] FASE 3: Refinar y expandir toda la suite hasta ≥ 95% global en todos los archivos (excluyendo incidencias).
- [ ] Ejecutar `npm run test -- --coverage` y verificar umbrales en cada fase.
- [ ] Refactorizar funciones complejas si es necesario para mejorar testabilidad.
- [ ] No introducir nuevos code smells.
