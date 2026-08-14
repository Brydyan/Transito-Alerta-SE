# Diseño Técnico para Implementación de Estilos CSS Responsivos y Estandarización Visual

Este documento describe las decisiones de diseño técnico para la estandarización de la responsividad en dispositivos móviles, la armonización de modales y la unificación del renderizado de tablas en el frontend de la aplicación (VanillaJS + Bootstrap 5 + CSS modular).

## 1. Archivos a Modificar / Crear

| Archivo / Ruta | Tipo de Modificación | Propósito / Descripción |
| :--- | :--- | :--- |
| [components.css](file:///frontend/styles/components.css) | Modificación | Actualizar la clase centralizada `.premium-modal-content` para incluir un borde sutil (`border: 1px solid var(--border-color) !important;`) y reafirmar el radio de borde (`border-radius: var(--radius-xl) !important;`). Agregar reglas de media queries y estilos responsivos para modales, tablas y componentes generales en resoluciones móviles. |
| [layout.css](file:///frontend/styles/layout.css) | Modificación | Añadir y perfeccionar media queries para prevenir desbordamientos horizontales (`overflow-x: hidden` en contenedores principales de layout) y ajustar el escalado fluido en pantallas menores a 768px. |
| [dashboard-cards.css](file:///frontend/styles/dashboard-cards.css) | Modificación | Añadir estilos o clases utilitarias de soporte para las tarjetas de botones de acceso rápido en el dashboard. |
| [dashboard.component.js](file:///frontend/js/pages/dashboard/components/dashboard-index/dashboard.component.js) | Modificación | Modificar la generación dinámica de `dashboardMenuContainer` en `loadMenuData()` para incorporar clases responsivas de Bootstrap (`d-none d-sm-block` en el texto y `justify-content-center justify-content-sm-start` en el contenedor del icono) de modo que en pantallas pequeñas solo se muestre el icono. |
| [dashboard.component.test.js](file:///frontend/js/pages/dashboard/components/dashboard-index/dashboard.component.test.js) | Modificación | Actualizar y añadir pruebas de Jest para verificar que el marcado HTML generado por `loadMenuData()` contiene las clases de responsividad para ocultar texto y mostrar solo iconos en móvil. |
| [estado-individual-incidencia-index.component.html](file:///frontend/js/pages/incidencias/components/estado-individual-incidencia/estado-individual-incidencia-index.component.html) | Modificación | Reemplazar alturas rígidas en línea (`max-height: 80vh; min-height: 50vh`) en el panel de chat y ciclo de vida por clases flexibles y utilidades flex de Bootstrap, garantizando que en resoluciones menores a 992px no ocurra una expansión innecesaria hacia abajo. |
| [estado-individual-incidencia-index.component.test.js](file:///frontend/js/pages/incidencias/components/estado-individual-incidencia/estado-individual-incidencia-index.component.test.js) | Modificación | Añadir y verificar pruebas unitarias de Jest para validar la estructura responsiva y la ausencia de estilos rígidos desbordantes en el contenedor del chat. |
| [categorias-index.component.html](file:///frontend/js/pages/categorias/components/index/categorias-index.component.html) | Modificación | Reemplazar la tabla HTML manual `#tbl-categorias` por el componente `<app-data-table id="tbl-categorias-data" title="Listado de Categorías" empty-text="No se encontraron categorías de incidencias registradas."></app-data-table>`. Asegurar que el modal implemente `.premium-modal-content` sin clases `border-0`. |
| [categorias-index.component.js](file:///frontend/js/pages/categorias/components/index/categorias-index.component.js) | Modificación | Refactorizar `cargarCategorias()` para inicializar e interactuar con `<app-data-table>`, pasando la configuración de columnas (incluyendo columna de relación padre o indentación en el render) y acciones (`editar`, `eliminar`, `agregar-sub`) mediante `.configure()` y `.items`. |
| [categorias-index.component.test.js](file:///frontend/js/pages/categorias/components/index/categorias-index.component.test.js) | Modificación | Actualizar los tests de Jest para verificar la integración correcta entre el módulo de Categorías y el componente `<app-data-table>`. |
| [kanban-index.component.html](file:///frontend/js/pages/instituciones/components/kanban/kanban-index.component.html) | Modificación | Reemplazar en el modal de resolución la clase inline `border-0` por `.premium-modal-content` para unificar borde y radio de borde con el sistema de diseño. |
| Varios archivos HTML de modales en vistas (ej. [incidencia-form.component.html](file:///frontend/js/pages/incidencias/components/lobby/form/incidencia-form.component.html), [institucion-form.component.html](file:///frontend/js/pages/instituciones/components/form/institucion-form.component.html), [permission-form.component.html](file:///frontend/js/pages/permissions/components/form/permission-form.component.html), [role-form.component.html](file:///frontend/js/pages/role/component/form/role-form.component.html), [direccion-form.component.html](file:///frontend/js/pages/ubicaciones/components/direcciones/direccion-form.component.html)) | Modificación | Revisar y eliminar la clase `border-0` del elemento `.modal-content` y asegurar que todos utilicen la clase centralizada `.premium-modal-content`. |

## 2. Firmas Nuevas y Clases CSS Compartidas

### Modales Estandarizados (`components.css`)
Se modifica y estandariza la clase CSS centralizada para que todos los modales compartan el mismo aspecto armónico:
```css
.premium-modal-content {
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-xl) !important;
  box-shadow: var(--shadow-lg) !important;
  overflow: hidden;
  background-color: var(--card-bg);
}
```

### Botones de Acceso Rápido en Dashboard (`dashboard.component.js`)
Se modifica el renderizador de los ítems en `loadMenuData()` para utilizar las utilidades responsivas nativas:
```javascript
<div class="col-6 col-md-4 col-lg-3">
  <a href="${menu.ruta || '#/'}" class="premium-card text-decoration-none d-block h-100 py-3 px-3 px-sm-4">
    <div class="d-flex align-items-center justify-content-center justify-content-sm-start gap-0 gap-sm-3 overflow-hidden">
      <div class="flex-shrink-0 bg-primary-soft rounded-circle p-3 text-primary d-inline-flex justify-content-center align-items-center shadow-sm" style="width: 48px; height: 48px;">
        <i class="${menu.icono || 'bi bi-grid'} fs-4"></i>
      </div>
      <div class="text-start flex-grow-1 overflow-hidden d-none d-sm-block">
        <span class="fw-bolder text-dark d-block text-truncate" style="letter-spacing: -0.01em; line-height: 1.2;" title="${menu.nombre}">${menu.nombre}</span>
      </div>
    </div>
  </a>
</div>
```

### Configuración de Tabla en Módulo de Categorías (`categorias-index.component.js`)
Se define la configuración estandarizada para `<app-data-table>`:
```javascript
tblDatos.configure({
  columns: [
    {
      header: 'Nombre',
      render: (cat) => `
        <div class="d-flex align-items-center">
          ${cat.parent_id ? '<i class="bi bi-arrow-return-right text-muted me-2 ms-3 small"></i>' : '<i class="bi bi-dot me-1 text-primary fs-5"></i>'}
          <span class="fw-bold text-dark">${cat.nombre || ''}</span>
        </div>
      `,
    },
    {
      header: 'Descripción / Ejemplos',
      render: (cat) => `<span class="text-muted small">${cat.descripcion || 'Sin descripción.'}</span>`,
    },
    {
      header: 'Estado',
      render: (cat) => `
        <span class="badge bg-${cat.activo ? 'success' : 'danger'}-soft text-${cat.activo ? 'success' : 'danger'} rounded-pill px-2.5 py-1 small fw-semibold">
          ${cat.activo ? 'Activa' : 'Inactiva'}
        </span>
      `,
    },
    {
      header: 'Acciones',
      class: 'text-end pe-4',
      actions: actionsList, // O render custom de dropdown manteniendo agregar-sub, editar, eliminar
    },
  ],
});
```

## 3. Excepciones y Manejo de Errores

- No se agregan nuevas clases de excepción a nivel de backend ya que la tarea se limita estrictamente a estilos CSS, maquetado HTML y componentes frontend VanillaJS.
- El manejo de errores al cargar las categorías o listas en pantallas pequeñas o grandes se seguirá procesando a través de los mecanismos encapsulados del componente `<app-data-table>` (evento de error y visualización de `ToastService.error`), garantizando una notificación clara y sin desbordamientos de interfaz en móviles.

## 4. Alternativas Descartadas con Justificación

### Alternativa 1: Reescritura del sistema visual con Tailwind CSS o reemplazo total del sistema de modales
- **Descripción**: Migrar las hojas de estilo del proyecto y las clases de modales a un framework utilitario como Tailwind CSS o adoptar una librería de modales externa de terceros para homogeneizar los bordes y el responsive design.
- **Justificación del descarte**: El proyecto tiene una arquitectura consolidada basada en variables CSS personalizadas y Bootstrap 5. Añadir frameworks externos viola la regla de no agregar dependencias sin aprobación, aumenta el tamaño de los assets de producción y rompería decenas de vistas existentes. Es un rediseño sobredimensionado para una labor de estandarización y corrección responsiva.

### Alternativa 2: Mantener la tabla HTML manual en Categorías agregando únicamente `table-responsive`
- **Descripción**: Conservar la tabla HTML estática en el archivo `categorias-index.component.html` y tan solo envolverla en un div `.table-responsive` para cumplir con la vista en móviles sin alterar la lógica en `categorias-index.component.js`.
- **Justificación del descarte**: Aunque es una solución rápida y de bajo esfuerzo, contraviene directamente el criterio de aceptación número 8 (que indica revisar y renderizar con `app-data-table-component`) y mantiene la deuda técnica de tener tablas divergentes en el sistema. Al unificarlo con `<app-data-table>`, se asegura que Categorías herede automáticamente las mejoras de paginación, estados de carga con skeletons y estados vacíos de forma uniforme con el resto del frontend.
