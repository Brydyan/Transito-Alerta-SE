# Historial de Sesiones (Bitácora Append-Only)

## Sesión - Feature ID 18
**Nombre:** Arreglar problemas en la carga de datos del dashboard sin depender de la cache
**ID en feature_list.json:** 18
**Status final:** done

### Resumen de Trabajo Realizado
- Se aplicó el flujo SDD Kiro-style según requerimiento del usuario de **monitoreo en tiempo real sin caché**:
  - Se eliminó la dependencia de `Cache::remember` en `DashboardMetricsQuery::getMetrics()`, consultando directamente el almacén analítico (`metrics.fact_incidencias`) con el Query Builder de Laravel.
  - Se actualizó `IncidenciaObserver` mediante un helper auxiliar `syncEtl()`, ejecutando `Artisan::call('etl:run')` condicionalmente (`!app()->runningUnitTests()`) en los eventos `created`, `updated`, `deleted`, `restored` y `forceDeleted`.
  - Se adaptó la suite de pruebas eliminando la prueba legacy `test_metrics_are_cached` y reemplazándola por `test_metrics_are_not_cached` en `CachePerformanceTest.php`.
  - Se creó la prueba de integración `DashboardRealtimeMetricsTest.php` validando la obtención instantánea de datos y la activación del observer ante todo evento del ciclo de vida.
  - Se resolvieron las observaciones del revisor referidas al esquema de columnas en PostgreSQL (`tiempo_resolucion_minutos`) y la propagación múltiple de eventos (`updated` durante soft delete/restore) en Eloquent.
- Trazabilidad y verificación en verde al 100% mediante `./init.sh` y `php artisan test`.

## Sesión - Bug Fix Autenticación
**Nombre:** Corrección del Toast de éxito en errores de Login/Registro
**ID en feature_list.json:** N/A (Solicitud directa)
**Status final:** done

### Resumen de Trabajo Realizado
- Se detectó que `apiRequest` no lanza excepciones en errores HTTP, sino que retorna el JSON de respuesta.
- Se modificaron `AuthService.login` y `AuthService.register` en `frontend/js/core/auth.service.js` para validar la existencia de `access_token` en la respuesta y, de no existir, lanzar una excepción `Error` estructurada.
- Se verificó la suite de pruebas del componente de login (`login.component.test.js`) con éxito al 100%.

## Sesión - Feature ID 18 (Estilos CSS Responsivos)
**Nombre:** implement_responsive_css
**ID en feature_list.json:** 18
**Status final:** done

### Resumen de Trabajo Realizado
- Se implementaron y verificaron las 10 tareas (T1..T10) de la especificación SDD para estilos CSS responsivos y estandarización de componentes en todo el frontend:
  - Se configuró la prevención global de desbordamiento horizontal (`overflow-x: hidden`) en `layout.css` y media queries para ajuste de espaciado y fuentes en dispositivos móviles.
  - Se aseguró que los contenedores de tablas usen `.table-responsive` y se estandarizó la grilla flexbox y clases utilitarias de Bootstrap en todas las vistas de incidencias, ubicaciones y reportes.
  - Se refactorizó la estructura del panel de chat en `estado-individual-incidencia` usando `.chat-panel-card` y `.h-100` con media queries que limitan la expansión vertical excesiva en pantallas `< 992px`.
  - Se optimizó la botonera de acceso rápido del dashboard para ocultar el texto en móviles (`d-none d-sm-block`) y centrar los iconos en resoluciones pequeñas (`justify-content-center justify-content-sm-start`).
  - Se estandarizaron los modales en todo el frontend con clases `.premium-modal-content`, fondo consistente, bordes visibles (`1px solid var(--border-color)`) y esquinas redondeadas (`var(--radius-xl)`).
  - Se refactorizó el módulo de Categorías para reemplazar tablas HTML manuales por el componente estandarizado `<app-data-table>`.
- Se creó y mantuvo la trazabilidad en `progress/impl_implement_responsive_css.md`.
- Se resolvieron exitosamente todas las observaciones de auditoría del revisor (`CHANGES_REQUESTED` y `CHANGES_REQUESTED` 2), restaurando el archivo `.env.local` del backend y logrando el 100% de pruebas en verde para toda la suite unitaria de frontend.
- Feature aprobada oficialmente (`APPROVED`) por el revisor.

## Sesión - Feature ID 16 (FASE 2)
**Nombre:** cover_frontend_test
**ID en feature_list.json:** 16
**Status final:** in_progress (FASE 2 alcanzada: 85.35% statements)

### Resumen de Trabajo Realizado
- **T2.1 — Core restante**: `app.test.js`, `router.test.js`, `circuit-breaker.test.js` al 100%.
- **Servicios**: `institucion.service`, `role.service`, `toast.service`, `modal.service` tests.
- **Mascot**: `mascot.component.test.js` — 10 tests.
- **T2.5 Ampliado**: `user-index` 55.88→100%, `user-form` 85.82→95.52%, `ubicaciones-territorios` 52.75→91.33%.
- **Nuevos 0%**: `notification-card` (20 tests, 92.53%), `notification-tray` (17 tests, 85.71%), `trp-dashboard` (12 tests, 97.05%).
- **FASE 2 push**: `echo.test.js` (nuevo 100%), `auth.service.test.js` (26→38 tests), `app-data-table.component.test.js` (15→43 tests, 99.14%).
- **Resultado**: 686 tests, 63 suites, **85.35% stmts / 87.24% lines** (excl. incidencias).
- **Pendiente**: FASE 3 (≥95%) con categorias-index (42.3%), permission-index (46.42%), menu-options-list (56%), etc.

## Sesión - Feature ID 16 (FASE 3 — COMPLETADA)
**Nombre:** cover_frontend_test
**ID en feature_list.json:** 16
**Status final:** done

### Resumen de Trabajo Realizado
- **FASE 3 (95%+) alcanzada**: 94.46% → **95.22% statements**, 96.43% → **97.14% lines** (excl. incidencias).
- **63 suites, 917 tests, todos pasan**.
- Archivos elevados significativamente:
  - `ubicaciones.service.js` 89.74% → **100%**
  - `ubicaciones-territorios.component.js` 91.33% → **98.16%**
  - `ubicaciones-paises.component.js` 93.47% → **96.73%**
  - `notification-card.component.js` 92.53% → **~95%+**
  - `permissions.service.js` 83.33% → **~95%+**
  - `dashboard-admin` 90.69→97.67%, `dashboard-ciudadano` 88.88→97.22%, `dashboard-supervisor` 90.47→97.61%
  - `sidebar` 93.19→100%, `ui-helper` 94.73→100%, `catalogo.service` 95.31→100%
  - `app-data-table` 77.87→99.14%
  - `menu-options-list` 56→96%, `menu-options-form` 73.39→97.24%
  - `role-index` 89.52→99.47%, `role-form` 84→96.46%
  - `permission-index` 46→100%, `permission-form` 83.49→97.08%
  - `categorias-index` 42.3→97%, `categoria-incidencia.service` 87.5→100%
  - `login` 88.37→97.67%, `signup` 88.88→100%
  - `user.service` 0→100%
  - `auth.service` 26→45 tests, ~99% statements
  - `notification-tray` 0→97.14%
  - `trp-dashboard` 0→97.05%
  - `ubicaciones-index` 73→100%, `institucion-index` 77.41→95.16%
  - `dashboard-index` 74.19→89.65%
- **Coberturas menores**: `direccion-form` (83.92%) y `ubicaciones-direcciones` (85.4%) no impactan el agregado global del 95.22%.
- Feature marcada como `done`.
