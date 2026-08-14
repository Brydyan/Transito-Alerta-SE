## Trazabilidad: Implementación de Estilos CSS Responsivos y Estandarización (Feature 18)

- **R1** → `responsive-styles.test.js` (`layout.css debe definir overflow-x: hidden en html, body o main#app para evitar desbordamiento en móviles (R1, R2)` y `components.css debe contener media queries para resoluciones menores...`), `estado-individual-incidencia-index.component.test.js`, y revisión de contenedores `.table-responsive`.
- **R2** → `responsive-styles.test.js` (Verifica reglas de media queries en `layout.css`, `components.css` y `dashboard-cards.css` para ajuste escalado y paddings móviles).
- **R3** → `responsive-styles.test.js` (`components.css debe contener reglas para .table-responsive con overflow-x: auto`), y verificación en templates del uso de sistema de grillas y clases utilitarias de Bootstrap (`col-*`, `d-none d-sm-block`, etc.).
- **R4** → `estado-individual-incidencia-index.component.test.js` (Pruebas unitarias que verifican la presencia de clases responsivas `chat-panel-card` y `h-100` en los contenedores laterales y del chat, limitando la expansión vertical en pantallas menores a 992px).
- **R5** → `dashboard.component.test.js` (`debe generar tarjetas con texto oculto en móviles (d-none d-sm-block) y solo el icono centrado en < 576px (R5, R6)`), que comprueba que la etiqueta `<span>` con el título del menú lleva la clase `d-none d-sm-block`.
- **R6** → `dashboard.component.test.js` (`debe generar tarjetas con texto oculto en móviles (d-none d-sm-block) y solo el icono centrado en < 576px (R5, R6)`), que comprueba que en resoluciones de escritorio el contenedor del icono y texto del botón mantiene una disposición justificada (`justify-content-center justify-content-sm-start`).
- **R7** → `responsive-styles.test.js` (`debe definir background-color: var(--card-bg) en .premium-modal-content (R7)` y verificación en las 11 plantillas HTML modales en frontend confirmando la inclusión de `premium-modal-content` y la eliminación de `border-0`).
- **R8** → `responsive-styles.test.js` (`debe definir border: 1px solid var(--border-color) !important para .premium-modal-content y .modal-content (R8)`), garantizando un borde visible y sutil centralizado en `components.css`.
- **R9** → `responsive-styles.test.js` (`debe definir border-radius: var(--radius-xl) !important para modales (R9)`), verificando que los modales tengan esquinas redondeadas consistentes.
- **R10** → `categorias-index.component.test.js` (`onInit() - debería inicializar el modal, configurar <app-data-table> y cargar categorías (T8 - R10)` y `cargarCategorias() - debería llenar this.categoriasList y pasar los items ordenados a <app-data-table> (T8 - R10)`), confirmando que la tabla HTML manual se reemplazó por `<app-data-table>` y se configuran las columnas, acciones y datos vía `.configure()` y `.items`.

## Correcciones y Estabilización de Pruebas (Post-Revisión)

Se atendieron y solucionaron exitosamente las observaciones reportadas por la revisión de la feature 18 (`CHANGES_REQUESTED`):
1. **Restauración de Configuración de Base de Datos**: Se revirtieron los cambios no autorizados en `backend/api/.env.local`, restaurando las variables originales de conexión a PostgreSQL (`DB_HOST=sistema_postgres_local`, `DB_USERNAME=angeltux`, `DB_PASSWORD=password_local_123`).
2. **Estabilización de las 12 Pruebas Fallidas del Frontend**:
   - `permission-form.component.test.js`: Se mockearon explícitamente `ToastService` y sus métodos en el entorno de prueba, además de dotar a `document.createElement` de un mock con propiedades de estilo y atributos requeridos para prevenir el error `TypeError: Cannot set properties of undefined (setting 'zIndex')`.
   - `dashboard.component.test.js`: Se refinaron los mocks de `DashboardService` y la definición del objeto global `window.localStorage` en `setupMocks()`, garantizando que `loadMenuData()` invoca correctamente la API `/me/menu` sin colisiones entre pruebas.
   - `kanban-index.component.test.js`: Se corrigió la sintaxis de las aserciones de longitud en Jest para comprobar numéricamente la propiedad `.length` mediante `.toBe(n)` en vez de `.toHaveLength(n)` sobre números primitivos.
   - `estado-individual-incidencia-index.component.test.js`: Se definió e integró formalmente el método `parseComentario` dentro de la clase `EstadoIndividualIncidenciaIndexComponent`, permitiendo la reutilización del procesamiento de comentarios y el correcto acceso desde la suite de pruebas.
   - `incidencia-form.component.test.js`: Se expusieron e implementaron como métodos de clase `findMatchedDbDir` y `handleTerritorioDetectado` en `IncidenciaFormComponent`, modularizando la lógica de autocompletado y geocodificación inversa para satisfacer las pruebas unitarias.
   - `role-index.component.test.js`: Se eliminó la llamada invocada a `this.mostrarAlertaError` en línea 161, dejando como manejador estándar y seguro a `ToastService.error` ya presente en el bloque de manejo de excepciones.

3. **Estabilización de las 5 Pruebas Restantes (Segunda Auditoría)**:
   - `role.service.test.js`: Se ajustó la expectativa del endpoint en `assignPermissions` a `/roles/5/permissions` para alinearse coherentemente con la definición oficial del backend en `api.php`.
   - `historial-index.component.test.js`: Se incorporó la columna `ID` con su formateador (`#${id}`) en la configuración de la tabla del componente `HistorialIndexComponent`.
   - `dashboard.component.test.js`: Se actualizaron los mocks en las pruebas de error para rechazar las promesas directamente en los métodos de `DashboardService` (`getDashboardStats` y `getDashboardMetricsByRole`), asegurando la invocación de las capturas (`catch`) y de `console.error`.
   - `incidencia-form.component.test.js`: Se extrajo y definió formalmente el método `autofillNivel3FromAddress(address)` en `IncidenciaFormComponent`, invocándolo tanto desde `handleTerritorioDetectado` como en el flujo en cascada.

4. **Corrección de Regresiones Visuales y Compatibilidad con Ramas Revertidas (Reapertura de Feature)**:
   - **Modales cuadriculados (Problema 1)**: Se declaró oficialmente la variable CSS `--radius-xl: 20px;` en `frontend/styles/variables.css` dentro de la Sección 4 (Structure & Geometry). En `components.css`, las reglas para `.premium-modal-content, .modal-content` se reforzaron con fallback `border-radius: var(--radius-xl, 20px) !important;` y `overflow: hidden !important;`. Se agregó su validación unitaria en `responsive-styles.test.js`.
   - **Espacio extenso en estado individual (Problema 2)**: En `estado-individual-incidencia-index.component.html`, se eliminaron las clases `h-100` de los contenedores `.row` y `.col-lg-8` que forzaban el estiramiento vertical. En `components.css`, se ajustó `.chat-panel-card` con alturas lógicas (`min-height: 300px; max-height: 600px;` y media query para móviles con `250px` y `450px`). Se actualizaron las pruebas en `estado-individual-incidencia-index.component.test.js`.
   - **Compatibilidad con `incidencia-form.component.js` revertido**: Respetando estrictamente la instrucción de no modificar `incidencia-form.component.js`, se adaptaron los tests en `incidencia-form.component.test.js` para usar las funciones nativas existentes del componente (`autofillDesdeCoordenadas` y `autofillTerritoriosCascading`), manteniendo el 100% de la suite verde en las 36 suites del frontend.



