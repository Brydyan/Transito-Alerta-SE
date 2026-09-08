# Specification: F6 Roles Redesign

## Layout

### Header
- Title: "Roles"
- Description: "Administra los roles del sistema y sus permisos para controlar el acceso a las diferentes funcionalidades de GeoReporta."
- Button: "+ Nuevo rol" (purple, top-right)

### Search & Actions
- Search input: "Nombre del rol..."
- Filtro button
- Limpiar button

### Table
Columns: NOMBRE | PERMISOS | ACCIONES

**Rows** (5 total):
1. admin_sistema (badge: "Sistema") | 48 (gray badge) | eye, ...
2. operador_sistema (badge: "Sistema") | 32 | eye, ...
3. admin_organizacion | 24 | eye, ...
4. operador_organizacion | 18 | eye, ...
5. usuario | 8 | eye, ...

**Pagination**: "Mostrando 1-5 de 5 roles registrados"

### Stats Cards (bottom, 3-column)
- **Total Permisos**: 124 (purple icon)
- **Módulos Protegidos**: 12 (gray lock icon)
- **Usuarios Asignados**: 85 (purple users icon)

Each card: Large number + description

## Scenarios

### S1: Roles list loads
**Given** user is admin  
**When** navigating to /app/admin/roles  
**Then**:
- Title & description visible
- "+ Nuevo rol" button visible
- Search input visible
- 5 roles render in table

### S2: Search filters
**Given** list is loaded  
**When** user types "operador"  
**Then**:
- Table shows only operador_sistema, operador_organizacion
- Pagination updates to "1-2 of 5"

### S3: Permissions badge shows
**Given** table renders  
**When** row loads  
**Then**:
- Gray badge with number (e.g., "48", "32")
- Represents permission count for that role

### S4: Stats cards display
**Given** page loads  
**When** stats endpoint returns data  
**Then**:
- "Total Permisos: 124"
- "Módulos Protegidos: 12"
- "Usuarios Asignados: 85"

### S5: Action menu
**Given** user clicks "..." on a role row  
**When** menu opens  
**Then**:
- Options: View, Edit, Delete
- Delete shows confirm dialog
- Delete calls /roles/{id}
- List refreshes

## Display Rules

- Role names in bold
- "Sistema" label badge (small, for system roles)
- Permission counts right-aligned
- Stats cards: large fonts (2xl), left-aligned text
