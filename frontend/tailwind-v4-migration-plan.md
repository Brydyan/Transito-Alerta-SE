# Plan de Implementación: Migración de Bootstrap a Tailwind CSS

Este plan establece una estrategia por fases para migrar la interfaz del proyecto de Bootstrap a Tailwind CSS V4. La clave del éxito radicará en **centralizar los estilos** usando los archivos SCSS existentes, lo que nos permitirá reemplazar Bootstrap "por debajo" y minimizar los cambios masivos en el HTML.

---

## 1. Estrategia de Arquitectura CSS

En lugar de llenar el HTML con docenas de clases de utilidad en cada botón o input, usaremos Tailwind mediante la directiva `@apply` dentro de los archivos de la carpeta `src/styles/`.

- **`src/styles/_variables.scss` & `_base.scss`**: Sincronizar colores y tipografías con el sistema de Tailwind.
- **`src/styles/_components.scss`**: Definir clases de Bootstrap estructurales como `.btn`, `.btn-primary`, `.card`, `.card-body` usando utilidades de Tailwind.
- **`src/styles/_forms.scss`**: Replicar `.form-control`, `.form-label`, `.form-select`.
- **`src/styles/_tables.scss`**: Adaptar la estructura de `.table`, `.table-responsive`, `.table-striped`.
- **`src/styles/_modals.scss` & `_badges.scss`**: Centralizar diálogos y etiquetas.

De esta manera, gran parte del HTML migrará automáticamente y solo ajustaremos márgenes, paddings o grillas (ej. pasar de `col-md-6` a `md:col-span-6`).

---

## 2. Inventario de Componentes a Migrar (30 en total)

Tras el análisis de los archivos, se identificaron **26 componentes con archivos HTML independientes** y **4 componentes con plantillas en línea (inline templates)**.

### Layout & Core

- `app.html`
- `layout/header/header.html`
- `layout/sidebar/sidebar.component.html`
- `layout/main-layout/main-layout.component.html`

### UI Kit & Componentes Compartidos (Shared)

- `shared/components/breadcrumb/breadcrumb.component.html`
- `shared/components/confirm-dialog/confirm-dialog.component.html`
- `shared/components/date-picker/date-picker.component.html`
- `shared/components/pagination/pagination.component.html`
- `shared/components/spinner/spinner.component.html`
- `shared/components/toast/toast.component.html`
- `shared/components/empty-state/empty-state.component.ts` _(Inline)_
- `shared/components/pdf-previewer/pdf-previewer.component.ts` _(Inline)_
- `shared/components/status-badge/status-badge.component.ts` _(Inline)_
- `shared/components/table-skeleton/table-skeleton.component.ts` _(Inline)_

### Autenticación & Perfil

- `features/auth/login/login.component.html`
- `features/auth/forgot-password/forgot-password.component.html`
- `features/auth/reset-password/reset-password.component.html`
- `features/auth/verify-email/verify-email.component.html`
- `features/profile/profile.component.html`

### Administración (CRUDs)

- `features/admin/component/admin.component.html`
- `features/admin/roles/roles.component.html`
- `features/admin/roles/role-editor/role-editor.component.html`
- `features/admin/users/user-management/user-management.component.html`
- `features/admin/users/user-form/user-form.component.html`
- `features/admin/system-config/system-config.component.html`

### Dashboards & Reportes

- `features/dashboard/dashboard.component.html`
- `features/reports/clients-list/clients-list.html`
- `features/reports/connection-history/connection-history.html`
- `features/reports/kpi-dashboard/kpi-dashboard.html`

### Errores

- `features/error/error-page/error-page.component.html`

---

## 3. Fases de Ejecución

### Fase 1: Configuración Core y Layout (Cimientos)

1. **Configuración Inicial:** Asegurar que Tailwind V4 está correctamente inicializado y purgado en el proyecto.
2. **Archivos SCSS Base:** Ajustar `_variables.scss`, `_base.scss` y `_layout.scss` combinando SCSS puro con `@apply`.
3. **Migración HTML:** Reemplazar clases de grilla y layout de Bootstrap (`container`, `row`, `col-*`, `d-flex`) por equivalentes Tailwind en el header, sidebar y main layout.

### Fase 2: Componentes Reutilizables (UI Kit)

1. **SCSS:** Traducir clases base en `_components.scss` (`.btn`, `.card`), `_modals.scss` y `_badges.scss`.
2. **Migración HTML:** Migrar todos los componentes de la carpeta `shared/`. Esto estabilizará elementos como botones, alertas, modales y paginadores para todo el proyecto.

### Fase 3: Formularios y Accesos

1. **SCSS Formularios:** Definir `.form-control`, `.form-select`, `.input-group` en `_forms.scss`.
2. **Migración HTML:** Adaptar todo el módulo de `auth` y la página de `profile`. Gracias a la fase anterior, el trabajo aquí será mínimo (principalmente flexbox y espaciados).

### Fase 4: Tablas y Administración

1. **SCSS Tablas:** Configurar `_tables.scss` para replicar el comportamiento de tablas responsive y con bordes/hover de Bootstrap.
2. **Migración HTML:** Refactorizar el módulo `admin` completo, prestando atención a los modales de edición (CRUDs) y listados.

### Fase 5: Reportes y Dashboards

1. **Migración HTML:** Abordar las pantallas con gráficas y filtros densos (`kpi-dashboard`, `clients-list`, `connection-history`).
2. **Ajustes:** Reemplazar utilidades de Bootstrap de espaciado (`mb-3`, `px-4`, etc.) por las de Tailwind. Aunque muchas coinciden, Tailwind tiene una escala ligeramente diferente.

### Fase 6: Desvinculación de Bootstrap [x]

1. Remover cualquier inclusión de CSS/JS de Bootstrap desde `angular.json` o `styles.scss`.
2. Desinstalar la dependencia `npm uninstall bootstrap` (o pnpm).
3. Realizar QA visual en distintos breakpoints para validar responsive design.
