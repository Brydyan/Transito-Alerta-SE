# Delta for frontend-incidents

## MODIFIED Requirements

### Requirement: Fila de incidencia

Cada fila DEBE mostrar título, categoría, prioridad, estado, ubicación, fecha y
acciones, según el mock 02-01. La columna de acciones DEBE presentar un menú
desplegable de tres puntos (three-dot dropdown) que reemplaza el botón "Ver"
único. Las opciones disponibles en el menú son: Asignar (role-gated),
Seguimiento, y Eliminar (handler diferido).
(Previously: actions column had a single "Ver" button; no dropdown menu existed)

#### Scenario: Composición de fila

- GIVEN una incidencia
- THEN se muestran su título en negrita, su categoría como subtítulo atenuado, badges de prioridad y estado, ubicación con icono, fecha con icono y un menú de acciones de tres puntos

#### Scenario: Dropdown shows Asignar for authorized roles

- GIVEN a user with the `ASSIGN assignments` permission
- WHEN the user opens the three-dot dropdown on any incident row
- THEN the dropdown shows Asignar, Seguimiento, and Eliminar options

#### Scenario: Dropdown hides Asignar for unauthorized roles

- GIVEN a user without the `ASSIGN assignments` permission
- WHEN the user opens the three-dot dropdown on any incident row
- THEN Asignar is absent; only Seguimiento and Eliminar are shown

#### Scenario: Asignar from row dropdown opens assignment modal

- GIVEN an authorized user opens the three-dot dropdown
- WHEN the user selects "Asignar"
- THEN the assignment modal opens with that incident pre-selected in the right panel

#### Scenario: Seguimiento from row dropdown opens tracking panel

- GIVEN any authenticated user opens the three-dot dropdown
- WHEN the user selects "Seguimiento"
- THEN the tracking panel opens for that incident

#### Scenario: Colores de badge

- GIVEN estados y prioridades
- THEN los colores provienen de los tokens de F0, sin literales de color en la plantilla

#### Scenario: Título largo

- GIVEN un título que excede el ancho de columna
- THEN se trunca con elipsis y conserva el texto completo como título accesible

#### Scenario: Navegación a detalle

- GIVEN una fila
- WHEN se activa «Ver detalle» (from dropdown or another affordance)
- THEN se navega a `/app/incidencias/:id`

## ADDED Requirements

### Requirement: RBAC Enforcement on Assignment Button

The frontend MUST evaluate the `ASSIGN assignments` permission before rendering
any assignment affordance. The backend MUST reject POST /assignments with HTTP
403 when the caller lacks `ASSIGN assignments`. These two layers MUST operate
independently so that a permission-stripped session cannot bypass the frontend
gate at the API level.

#### Scenario: Frontend hides assignment affordances without permission

- GIVEN a user without `ASSIGN assignments` is on the incidents list
- WHEN the list and toolbar render
- THEN neither the toolbar "Asignar" button nor the row dropdown "Asignar" option are present in the DOM

#### Scenario: Backend rejects assignment without permission

- GIVEN a request to POST /assignments is made without a valid `ASSIGN assignments` permission token
- WHEN the backend processes the request
- THEN HTTP 403 is returned and no assignment record is created

#### Scenario: org-scoped admin sees only own org incidents and operators

- GIVEN a user with role admin_org
- WHEN the assignment modal is open
- THEN the operator list shows only operador_org users from the same organization, and the unassigned incidents panel shows only incidents from that organization
