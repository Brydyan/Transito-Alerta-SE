# Specification: F5.7 — Mejoras a /app/admin/controles

## Requirements

### R1 — Endpoints asignados deben cargarse al seleccionar menú

**Goal**: El panel de endpoints en la derecha debe mostrar qué endpoints están asignados a la opción seleccionada.

**Scenarios**:

1. **Cargar endpoints asignados al seleccionar**
   - Dado: una opción de menú con 3 endpoints asignados
   - Cuando: el usuario la selecciona en el árbol
   - Entonces: el panel muestra los 3 endpoints en la sección "Asignados"

2. **Opción sin endpoints retorna lista vacía**
   - Dado: una opción recién creada (sin endpoints)
   - Cuando: se selecciona
   - Entonces: la sección "Asignados" está vacía

3. **Error en carga se notifica**
   - Dado: un error en el backend al obtener endpoints
   - Cuando: se selecciona un menú
   - Entonces: aparece un toast de error sin romper la UI

### R2 — Matriz de roles agrupada por ámbito

**Goal**: Los roles deben agruparse visualmente en tres bloques (Plataforma, Organización, Público).

**Scenarios**:

1. **Roles agrupados por scope**
   - Dado: 5 roles en el catálogo (master, operador_sistema, admin_org, operador_org, reporter)
   - Cuando: se selecciona una opción de menú
   - Entonces: aparecen 3 bloques visuales (Plataforma con 2, Organización con 2, Público con 1)

2. **Matriz dentro de cada bloque**
   - Dado: un bloque "Plataforma" con master y operador_sistema
   - Cuando: se renderiza
   - Entonces: cada rol muestra dos checkboxes (Read, Write) coordinados

3. **Cambio en matriz se persiste**
   - Dado: matriz visible con lectura/escritura
   - Cuando: el usuario marca/desmarca un checkbox
   - Entonces: se llama `PUT /menu-options/:id/roles/:roleId` con los nuevos valores

### R3 — Indicadores visuales de jerarquía en árbol

**Goal**: El árbol debe mostrar visualmente qué nodos son expandibles.

**Scenarios**:

1. **Chevron visible en nodos con hijos**
   - Dado: un menú principal "Reportes" con 2 sub-menús
   - Cuando: se renderiza el árbol
   - Entonces: "Reportes" muestra un chevron `▶` (cerrado) o `▼` (abierto)

2. **Chevron ausente en hojas**
   - Dado: un sub-menú sin hijos
   - Cuando: se renderiza
   - Entonces: no hay chevron visible

3. **Click en chevron expande/colapsa**
   - Dado: un nodo con chevron cerrado
   - Cuando: se hace click en el chevron
   - Entonces: expande mostrando hijos, chevron gira

### R4 — Recomendación de orden para nuevos menús

**Goal**: Al crear un menú, el campo de orden debe sugerir el siguiente número.

**Scenarios**:

1. **Sugerencia para menú principal**
   - Dado: 3 menús principales con orden 10, 20, 30
   - Cuando: se abre el formulario "Crear nuevo menú" (sin padre)
   - Entonces: el campo orden muestra "(siguiente: 40)" como sugerencia

2. **Sugerencia para sub-menú**
   - Dado: un menú "Usuarios" con 2 sub-menús de orden 1 y 2
   - Cuando: se crea sub-menú bajo "Usuarios"
   - Entonces: el campo muestra "(siguiente: 3)"

3. **Usuario puede sobrescribir**
   - Dado: recomendación de orden 40
   - Cuando: el usuario borra y escribe 50
   - Entonces: se persiste 50 (no hay validación de estrategia)

### R5 — Confirmación antes de borrar menú

**Goal**: Prevenir borrado accidental de opciones de menú.

**Scenarios**:

1. **Modal de confirmación aparece**
   - Dado: un menú seleccionado
   - Cuando: el usuario hace click en "Eliminar"
   - Entonces: aparece modal: "¿Eliminar 'Usuarios'? Esta acción no se puede deshacer."

2. **Confirmación ejecuta delete**
   - Dado: modal abierto
   - Cuando: el usuario hace click en "Eliminar"
   - Entonces: se ejecuta `DELETE /menu-options/:id` y se actualiza el árbol

3. **Cancelación cierra modal**
   - Dado: modal abierto
   - Cuando: el usuario hace click en "Cancelar"
   - Entonces: el modal cierra sin eliminar nada

### R6 — Filtro de endpoints por módulo (opcional)

**Goal**: Facilitar búsqueda en el catálogo de endpoints cuando hay muchos.

**Scenarios**:

1. **Filtro por palabra clave en ruta**
   - Dado: catálogo con 50+ endpoints
   - Cuando: el usuario escribe "incidents" en el campo de búsqueda
   - Entonces: el catálogo muestra solo endpoints con "incidents" en la ruta

2. **Búsqueda vacía retorna todos**
   - Dado: campo de búsqueda con foco
   - Cuando: el usuario borra el texto
   - Entonces: se muestran todos los endpoints

3. **Búsqueda insensible a mayúsculas**
   - Dado: búsqueda "Incidents"
   - Cuando: se ejecuta
   - Entonces: retorna endpoints de "incidents" (case-insensitive)

### R7 — Invariante: lectura requerida para escritura

**Goal**: Validar que un rol con escritura también tenga lectura.

**Scenarios**:

1. **No permitir Write sin Read**
   - Dado: matriz con un rol
   - Cuando: el usuario intenta marcar Write sin marcar Read
   - Entonces: el checkbox Write se deshabilita o automáticamente se marca Read

2. **Permitir Read sin Write**
   - Dado: matriz
   - Cuando: el usuario marca solo Read
   - Entonces: Write queda desmarcado, sin error

3. **Backend rechaza Write sin Read**
   - Dado: un PUT a `/menu-options/:id/roles/:roleId` con `{canRead: false, canWrite: true}`
   - Cuando: se envía
   - Entonces: retorna 422 con mensaje "La escritura requiere lectura"

## Data Contracts

### Request/Response

**GET /menu-options/:id/endpoints** (D1)

Request:
```
GET /api/menu-options/a1b2c3d4.../endpoints
Authorization: Bearer <token>
```

Response:
```json
[
  {
    "id": "ep1-uuid",
    "method": "GET",
    "path": "/api/incidents",
    "description": "List all incidents"
  },
  {
    "id": "ep2-uuid",
    "method": "POST",
    "path": "/api/incidents",
    "description": "Create incident"
  }
]
```

Error: `404` si el menú no existe, `403` si sin permiso READ menu-options

**GET /menu-options/endpoints?module=incidents** (D6)

Request:
```
GET /api/menu-options/endpoints?module=incidents&page=1&limit=20
Authorization: Bearer <token>
```

Response (igual a catálogo, pero filtrado):
```json
{
  "data": [
    { "id": "...", "method": "GET", "path": "/api/incidents", "description": "..." },
    { "id": "...", "method": "POST", "path": "/api/incidents", "description": "..." }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

### Frontend Models

**RoleMatrix** (mejorada):

```typescript
export interface RoleMatrix {
  optionId: string;
  rolesByScope: {
    platform: RoleAccess[];    // master, operador_sistema
    organization: RoleAccess[]; // admin_org, operador_org
    public: RoleAccess[];       // reporter
  };
}

export interface RoleAccess {
  roleId: string;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
}
```

**MenuOption** (sin cambios):

```typescript
export interface MenuOption {
  id: string;
  name: string;
  route: string;
  icon?: string;
  parent_id?: string;
  display_order: number;
  is_active: boolean;
}
```

## Success Criteria

- [ ] Nuevo endpoint `GET /menu-options/:id/endpoints` retorna lista correcta
- [ ] Matriz agrupa roles por 3 ámbitos visuales
- [ ] Árbol muestra chevrones en nodos con hijos
- [ ] Campo de orden sugiere siguiente número
- [ ] Modal de confirmación previene borrado accidental
- [ ] Filtro de endpoints por módulo reduce resultado
- [ ] Invariante Read→Write validado en backend (422)
- [ ] Todos los tests unitarios pasan
- [ ] Smoke test manual: crear menú → asignar endpoints → ver cargados
