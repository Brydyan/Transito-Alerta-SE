# Spec: F2 — Catálogos

## Domain: frontend-catalogs (NEW)

### Requirement: Listado con búsqueda, filtro y paginación
Cada catálogo DEBE ofrecer un listado paginado con búsqueda por texto y, cuando el
mock lo define, un filtro por atributo.

- Scenario: Carga inicial — GIVEN un usuario con permiso de lectura WHEN abre el
  catálogo THEN se muestra la primera página y el pie indica el rango y el total
- Scenario: Búsqueda — GIVEN un término de búsqueda WHEN el usuario deja de escribir
  THEN se solicita al servidor el listado filtrado, con debounce, y la paginación
  vuelve a la primera página
- Scenario: Filtro por nivel — GIVEN el catálogo de Ubicaciones WHEN se elige un nivel
  (`País|Provincia|Cantón|Parroquia`) THEN sólo se listan zonas de ese nivel
- Scenario: Sin resultados — GIVEN una búsqueda sin coincidencias THEN se renderiza
  `empty-state`, no una tabla vacía
- Scenario: Carga en progreso — GIVEN una petición en vuelo THEN se muestra
  `table-skeleton`, no un salto de maquetación
- Scenario: Limpiar filtros — GIVEN búsqueda y filtro activos WHEN se pulsa limpiar
  THEN ambos se restablecen y el listado vuelve a la primera página sin filtrar

### Requirement: Árbol jerárquico de Ubicaciones
El catálogo de Ubicaciones DEBE renderizarse como árbol de cuatro niveles con
expansión y plegado por fila.

- Scenario: Expandir — GIVEN una fila `Provincia` plegada WHEN el usuario la expande
  THEN sus cantones aparecen indentados bajo ella, con su badge de nivel
- Scenario: Indentación por profundidad — GIVEN una `Parroquia` THEN su sangría es
  mayor que la de su cantón padre, y su badge indica `Parroquia`
- Scenario: Nodo hoja — GIVEN una fila sin descendientes THEN no se ofrece control
  de expansión
- Scenario: Búsqueda dentro del árbol — GIVEN un término que coincide con un nodo
  profundo THEN se muestra ese nodo con sus ancestros expandidos, para no perder el
  contexto jerárquico
- Scenario: Código visible — GIVEN cualquier fila THEN su código (`EC`, `EC-24-01-02`)
  se muestra en tipografía monoespaciada, como en el mock 06-01

### Requirement: Alta y edición
Cada catálogo DEBE permitir crear y editar registros mediante formulario validado.

- Scenario: Alta válida — GIVEN un formulario correctamente diligenciado WHEN se
  envía THEN se crea el registro, se muestra un toast de éxito y se vuelve al listado
- Scenario: Validación cliente — GIVEN un campo obligatorio vacío WHEN se intenta
  enviar THEN no se emite la petición y el campo muestra su error
- Scenario: Validación servidor — GIVEN el backend responde 422 WHEN se procesa la
  respuesta THEN los errores se asocian a sus campos, sin descartarlos en un toast genérico
- Scenario: Edición precargada — GIVEN la ruta de edición de un registro existente
  THEN el formulario se abre con sus valores actuales
- Scenario: Selección de padre — GIVEN el alta de una Ubicación de nivel `Cantón`
  THEN el selector de padre ofrece únicamente zonas de nivel `Provincia`
- Scenario: Cancelar — GIVEN cambios sin guardar WHEN se cancela THEN se pide
  confirmación antes de descartar

### Requirement: Borrado confirmado
El borrado DEBE requerir confirmación explícita y DEBE reflejarse sin recargar la página.

- Scenario: Borrado confirmado — GIVEN un registro y permiso de borrado WHEN se
  confirma en el diálogo THEN se emite la petición y la fila desaparece del listado
- Scenario: Borrado cancelado — GIVEN el diálogo abierto WHEN se cancela THEN no se
  emite ninguna petición
- Scenario: Conflicto de integridad — GIVEN el backend responde 409 por referencias
  existentes THEN se informa el motivo y el registro permanece

### Requirement: La UI respeta los permisos de escritura
Las acciones de escritura DEBEN ocultarse a quien no tiene el permiso correspondiente.

- Scenario: Sólo lectura — GIVEN un usuario con `READ organizations` pero sin
  `CREATE organizations` THEN no se renderiza el botón de alta
- Scenario: Acciones de fila — GIVEN un usuario sin `UPDATE`/`DELETE` THEN el menú
  de acciones no ofrece editar ni borrar
- Scenario: Defensa en profundidad — GIVEN una llamada directa a la ruta de alta sin
  permiso THEN el guard impide el montaje, sin depender de que el botón esté oculto

## Coverage

Happy paths: cubiertos (listar, buscar, filtrar, crear, editar, borrar, expandir).
Edge cases: cubiertos (sin resultados, nodo hoja, búsqueda profunda en árbol, cancelar
con cambios, selector de padre acotado por nivel).
Error states: cubiertos (422 por campo, 409 por integridad, permisos ausentes).
Pendiente: comportamiento offline — `offline-sync.service.ts` existe pero su alcance
se define en F4, donde el ciudadano reporta sin red.

## Next

Listo para `sdd-design`. Depende de F0 y F1; no bloquea otras fases.
