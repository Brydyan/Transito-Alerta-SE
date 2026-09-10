# Specification: F6 Usuarios Redesign

## Layout

### Header
- Title: "Administración de Usuarios"
- Description: "Gestione el acceso del personal municipal, asigne roles específicos por organización y supervise el estado de las cuentas del sistema."
- Button: "+ Nuevo usuario" (purple, top-right)

### Search & Filters
- Search input: "Buscar por nombre, email o cargo..."
- Dropdown 1: "Todos los roles" (default)
- Dropdown 2: "Todas las organizaciones" (default)
- Filtro button + X (clear filters)

### Table
Columns: FOTO | NOMBRE COMPLETO | EMAIL / CONTACTO | ROL ASIGNADO | ORGANIZACIÓN | ESTADO | ACCIONES

**Rows** (7 shown):
1. Photo | Admin GAD Guayaquil - Norte | admin.gad-guayaquil-norte | ADMIN ORG (badge) | GAD Guayaquil - Norte | Activo (green checkmark) | eye, ...
2. Photo | Operador GAD Guayaquil - Norte | operador.gad-guayaquil-nc | OPERADOR ORG (badge) | GAD Guayaquil - Norte | Activo | eye, ...
... (5 more similar rows)

**Pagination**: "Mostrando 1-7 de 25 usuarios registrados"  
- Prev/Next buttons, page numbers (1, 2, 3, ..., 8)

### Bottom Cards
3 cards (each 1/3 width):
- "Políticas de Seguridad" → Link "Configurar seguridad ..."
- "Gestión de Organizaciones" → Link "Ver organizaciones ..."
- "Auditoría de Acceso" → Link "Descargar reporte CSV ..."

## Scenarios

### S1: Users list loads
**Given** user is logged in as admin  
**When** user navigates to /app/admin/usuarios  
**Then**:
- Title & description render
- "+ Nuevo usuario" button visible
- Search input and filters visible
- Table displays 7 users

### S2: Search filters locally
**Given** list is displayed with 7 users  
**When** user types "admin" in search  
**Then**:
- Table updates to show only rows matching "admin" (name, email, or role)
- Pagination updates count ("1-3 of 7")

### S3: Role filter works
**Given** filters dropdown shows "Todos los roles"  
**When** user selects "ADMIN ORG"  
**Then**:
- Table shows only admin_org role users
- Count updates

### S4: Organization filter works
**Given** filters dropdown shows "Todas las organizaciones"  
**When** user selects "GAD Guayaquil - Norte"  
**Then**:
- Table shows only users from that organization

### S5: Status badges display
**Given** table is rendered  
**When** state field is "Activo"  
**Then**:
- Green checkmark icon + "Activo" text
- If "Inactivo": red icon + "Inactivo" text

### S6: Pagination works
**Given** list shows page 1  
**When** user clicks page 2  
**Then**:
- Table updates to show rows 8-14 (25 per page)
- "Mostrando 8-14 de 25" text updates
- Page 2 button is highlighted

### S7: Action menu works
**Given** user hovers over "..." button  
**When** user clicks  
**Then**:
- Menu appears with options (Edit, View, Delete, etc.)
- Menu closes on click outside

### S8: Error state — endpoint fails
**Given** /users endpoint returns 500  
**When** page loads  
**Then**:
- Loading spinner shows briefly
- Error message: "No se pudieron cargar los usuarios"
- Retry button visible

## Filter Behavior

- Search is **local** (filter in-memory)
- Role & Organization filters are **backend queries** (reload table)
- Can combine: search + role + org (AND logic)
- Clear filters: X button resets all three
