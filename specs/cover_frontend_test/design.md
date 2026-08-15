# Design: Cobertura de Pruebas Frontend

## Arquitectura de Pruebas
Las pruebas unitarias se escribirán utilizando Jest + jsdom (configuración existente en `frontend/jest.config.cjs`). Se mantendrá el mismo enfoque que las pruebas existentes:
- `jest.spyOn` y mocks globales para aislar componentes y servicios.
- Interceptación de llamadas a la API (`window.fetch`, `apiRequest`).
- Mock del servicio de autenticación y del DOM.
- Tests co-localizados con el fuente usando nomenclatura `*.test.js`.
- ES Modules nativos (`--experimental-vm-modules`), sin Babel.

## Estrategia por Fases

### FASE 1 — Objetivo: ≥ 75% cobertura global
Enfocarse en archivos **sin test previo** que sean más críticos (core, shared, componentes comunes). Priorizar aquellos con lógica pura, servicios y componentes de UI sencillos.

### FASE 2 — Objetivo: ≥ 85% cobertura global
Completar los archivos sin test que quedaron pendientes en FASE 1, y mejorar los tests existentes con cobertura actual < 80%.

### FASE 3 (FINAL) — Objetivo: ≥ 95% cobertura global
Refinar todos los tests existentes para cubrir casos borde, manejo de errores, ramas condicionales no cubiertas, y verificar que ningún archivo quede por debajo del umbral.

---

> **Nota**: El módulo `pages/incidencias/` (6 fuentes con sus tests) queda EXCLUIDO porque está siendo refactorizado en otra rama.

## Inventario completo de archivos a testear (57 fuentes)

### Módulo: Core (Núcleo)
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `app.js` | Crear | 2 | Mock de módulos importados; probar inicialización del router y componentes globales |
| `router.js` | Crear | 2 | Mock de AuthService; probar resolución de rutas, redirecciones, permisos |
| `core/api.js` | Crear | 1 | Mock de `window.fetch` y `AbortController`; probar métodos HTTP normales y con reintentos (circuit-breaker) |
| `core/auth.service.js` | Crear | 1 | Mock de `localStorage`, `window.fetch`; probar login, logout, refresh token, estado de autenticación |
| `core/base-component.js` | Crear | 1 | Mock de `HTMLElement`; probar ciclo de vida, bindeo de eventos, render condicional |
| `core/circuit-breaker.js` | Crear | 2 | Probar lógica de estados (open/closed/half-open), fallo y recuperación |
| `core/echo.js` | Crear | 3 | Mock de Laravel Echo; probar suscripción canales, eventos entrantes |
| `core/mascot/mascot.component.js` | Crear | 3 | Mock de animaciones; probar render condicional según estado de carga/error |

### Módulo: Shared
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `shared/constants.js` | Crear | 1 | Probar que las constantes exportadas tengan valores correctos |
| `shared/utils/ui-helper.js` | Crear | 1 | Mock de Bootstrap; probar formatos de fecha, normalización de strings, utilerías |
| `shared/utils/badge-states.js` | Crear | 1 | Probar mapeo de estados a clases CSS, colores, badges |
| `shared/services/catalogo.service.js` | Crear | 1 | Mock de `apiRequest`; probar cada método simulando respuestas exitosas y de error |
| `shared/services/modal.service.js` | Crear | 1 | Mock de Bootstrap.Modal; probar configuración, apertura, cierre, eventos |
| `shared/services/toast.service.js` | Crear | 1 | Mock de Bootstrap.Toast; probar tipos (success/error/warning), duración, posicionamiento |
| `shared/components/app-data-table/app-data-table.component.js` | Crear | 2 | Mock de fetch (HTML template); probar render de tabla, paginación, filtros, ordenamiento |
| `shared/components/modal/modal.component.js` | Crear | 2 | Custom element; mock de Bootstrap.Modal; probar render slot, apertura/cierre programático |
| `shared/components/toast/toast.component.js` | Crear | 2 | Custom element; mock de Bootstrap.Toast; probar render y autodestrucción |

### Módulo: Componentes Generales
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `components/stats-card.js` | Crear | 1 | Mock de fetch (HTML); probar render con diferentes datos, estado vacío |
| `components/sidebar/sidebar.component.js` | Crear | 2 | Mock de AuthService; probar render condicional según permisos/roles |
| `components/navbar/navbar.component.js` | Crear | 2 | Mock de AuthService; probar render condicional, menú de usuario |
| `components/navbar/notification/notification-card.component.js` | Crear | 3 | Mock de fetch; probar render de notificación individual, clics |
| `components/navbar/notification/notification-tray.component.js` | Crear | 3 | Mock de fetch, Echo; probar lista de notificaciones, marcado como leídas |
| `components/menu-lobby/menu-lobby.component.js` | Crear | 2 | Mock de fetch (HTML); probar render condicional según permisos |

### Módulo: Páginas (sin test)
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `pages/signup/signup.component.js` | Crear | 1 | Mock de authService; probar validación de formulario, registro exitoso/error |
| `pages/auth/activate/activate.component.js` | Crear | 2 | Mock de fetch con token en query; probar activación exitosa/expirada |
| `pages/trp-dashboard/trp-dashboard.component.js` | Crear | 3 | Mock de servicios de dashboard; probar render condicional según rol |
| `pages/instituciones/components/index/institucion-index.component.js` | Crear | 2 | Mock de institucionService; probar listado, CRUD, manejo de errores |
| `pages/instituciones/components/form/institucion-form.component.js` | Crear | 2 | Mock de institucionService; probar validación, creación/edición, error 422 |

### Módulo: User (mejorar tests existentes)
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `pages/user/components/index/user-index.component.js` | Mejorar | 2 | Identificar líneas no cubiertas (manejo de errores, DOM faltante, casos borde) |
| `pages/user/components/form/user-form.component.js` | Mejorar | 2-3 | Refactorizar funciones largas (>150 líneas) cubriendo todas las ramas |

### Módulo: Ubicaciones (mejorar tests existentes)
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `pages/ubicaciones/components/territorios/ubicaciones-territorios.component.js` | Mejorar | 2-3 | Refactorizar (~629 líneas) aplicando "divide y vencerás"; probar jerarquía, carga asíncrona, errores |

### Módulo: Páginas con test (mantener / verificar cobertura)
| Archivo | Test | Fase | Estrategia |
|---------|------|------|------------|
| `pages/login/login.component.js` | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/user/services/user.service.js` | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/role/` (3 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/permissions/` (3 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/menu-options/` (3 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/instituciones/services/institucion.service.js` | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/instituciones/components/kanban/kanban-index.component.js` | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/dashboard/` (6 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/categorias/` (2 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |
| `pages/ubicaciones/` restantes (5 files) | Verificar | 3 | Revisar cobertura actual y agregar casos faltantes |

## Principios de diseño de pruebas
1. **Aislamiento**: Cada test mockea sus dependencias externas (fetch, localStorage, Bootstrap, AuthService).
2. **Determinismo**: Sin estado compartido entre tests; usar `beforeEach`/`afterEach` para setup/teardown.
3. **Casos borde**: Probar respuestas vacías, errores de red, payloads inválidos, elementos DOM ausentes.
4. **Refactorización**: Si una función es difícil de testear (>150 líneas, muchas ramas), refactorizarla primero aplicando "divide y vencerás" para evitar code smells.
5. **Cobertura por fase**: Cada fase debe completar el umbral antes de pasar a la siguiente.
