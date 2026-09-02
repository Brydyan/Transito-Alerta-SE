# Spec: F3 — Módulo de Incidencias

## Domain: frontend-incidents (NEW)

### Requirement: Listado con filtros combinables
El listado DEBE permitir filtrar por texto, estado y prioridad, y los filtros DEBEN
combinarse entre sí.

- Scenario: Filtros combinados — GIVEN estado `en_proceso` y prioridad `alta`
  WHEN se aplican THEN sólo se listan incidencias que cumplen ambas condiciones
- Scenario: Búsqueda por texto — GIVEN un término WHEN el usuario deja de escribir
  THEN se consulta por título o descripción, con debounce, y la paginación vuelve a
  la primera página
- Scenario: Limpiar — GIVEN filtros activos WHEN se pulsa limpiar THEN todos se
  restablecen y se recarga el listado completo
- Scenario: Filtros en la URL — GIVEN un listado filtrado WHEN se copia la URL y se
  abre en otra pestaña THEN se restauran los mismos filtros y página
- Scenario: Conteo — GIVEN una página de resultados THEN el pie indica el rango y el
  total, con la forma «Mostrando 1-10 de 14 incidencias»

### Requirement: Filtro por categoría y subcategoría
El listado DEBE permitir filtrar por categoría y por subcategoría, de forma jerárquica.

- Scenario: Categoría padre — GIVEN una categoría con subcategorías WHEN se marca el
  padre THEN se incluyen todas sus subcategorías en el filtro
- Scenario: Subcategoría suelta — GIVEN sólo algunas subcategorías marcadas THEN el
  padre se muestra en estado indeterminado, ni marcado ni desmarcado
- Scenario: Combinado con los demás filtros — GIVEN categoría, estado y prioridad
  seleccionados THEN el listado cumple las tres condiciones a la vez
- Scenario: Persistido en la URL — GIVEN una selección de categorías WHEN se copia la
  URL THEN al abrirla se restaura la misma selección
- Scenario: Sin categorías seleccionadas — GIVEN el filtro vacío THEN no se restringe
  por categoría, en lugar de devolver un listado vacío

### Requirement: Fila de incidencia
Cada fila DEBE mostrar título, categoría, prioridad, estado, ubicación, fecha y
acciones, según el mock 02-01.

- Scenario: Composición de fila — GIVEN una incidencia THEN se muestran su título en
  negrita, su categoría como subtítulo atenuado, badges de prioridad y estado,
  ubicación con icono, fecha con icono y un menú de acciones
- Scenario: Colores de badge — GIVEN estados y prioridades THEN los colores provienen
  de los tokens de F0, sin literales de color en la plantilla
- Scenario: Título largo — GIVEN un título que excede el ancho de columna THEN se
  trunca con elipsis y conserva el texto completo como título accesible
- Scenario: Navegación a detalle — GIVEN una fila WHEN se activa «Ver detalle»
  THEN se navega a `/app/incidencias/:id`

### Requirement: Detalle de incidencia
El detalle DEBE presentar los datos completos, el historial de estado, las imágenes
y el hilo de comentarios.

- Scenario: Carga — GIVEN un id válido THEN se muestran título, descripción,
  categoría, prioridad, estado, ubicación, autor y fechas
- Scenario: Historial — GIVEN una incidencia con transiciones THEN se listan en orden
  cronológico con estado, autor y momento
- Scenario: Ubicación — GIVEN una incidencia con coordenadas THEN se muestra un
  mini-mapa centrado en el punto
- Scenario: Sin coordenadas — GIVEN una incidencia sin coordenadas THEN el bloque de
  mapa se omite, sin dejar un contenedor vacío
- Scenario: Id inexistente — GIVEN un id que no existe THEN se muestra un estado de
  no encontrado dentro del layout, no la página de error global
- Scenario: Galería — GIVEN una incidencia con imágenes THEN se muestran en galería
  y pueden ampliarse

### Requirement: Acciones de flujo de trabajo
El detalle DEBE ofrecer las acciones de flujo que el backend expone, condicionadas al
estado actual y a los permisos.

- Scenario: Reclamar — GIVEN una incidencia disponible y permiso `UPDATE incidents`
  WHEN se reclama THEN queda asignada al usuario actual y el estado se refleja sin recargar
- Scenario: Liberar — GIVEN una incidencia reclamada por el usuario actual WHEN se
  libera THEN vuelve a disponible
- Scenario: Transición inválida — GIVEN un estado desde el que la transición no está
  permitida THEN la acción no se ofrece; si el backend responde 409 se muestra el
  motivo y el estado mostrado se resincroniza
- Scenario: Sin permiso — GIVEN un usuario sin `UPDATE incidents` THEN no se renderiza
  ninguna acción de flujo
- Scenario: Asignar — GIVEN permiso `ASSIGN assignments` THEN puede asignarse la
  incidencia a un operador de la organización

### Requirement: Hilo de comentarios
El detalle DEBE mostrar los comentarios y permitir añadir nuevos con imágenes adjuntas.

- Scenario: Listado — GIVEN una incidencia con comentarios THEN se muestran en orden
  cronológico con autor, avatar, momento y contenido
- Scenario: Anidación — GIVEN respuestas a un comentario THEN se muestran anidadas
  bajo su padre, respetando la profundidad máxima del backend
- Scenario: Publicar — GIVEN permiso `CREATE comments` y contenido no vacío WHEN se
  publica THEN el comentario aparece en el hilo sin recargar la página
- Scenario: Adjuntar imágenes — GIVEN hasta cinco imágenes seleccionadas THEN se
  comprimen en cliente y se envían en un único `FormData` bajo el campo `images`
- Scenario: Exceso de archivos — GIVEN más de cinco imágenes THEN se impide el envío
  en cliente con un mensaje claro, sin depender del 422 del servidor
- Scenario: Sólo lectura — GIVEN un usuario sin `CREATE comments` THEN el hilo se
  muestra sin el formulario de publicación

### Requirement: Tarjetas de contexto
El pie del listado DEBE mostrar las tres tarjetas de contexto del mock 02-01.

- Scenario: Render — GIVEN el listado cargado THEN se muestran cobertura territorial,
  incidencias abiertas y tiempo de respuesta, cada una con su etiqueta de estado
- Scenario: Datos no disponibles — GIVEN que la métrica no se puede calcular THEN la
  tarjeta muestra un guion, no cero — cero es un valor con significado propio

## Coverage

Happy paths: cubiertos (listar, filtrar, ver detalle, comentar, transicionar).
Edge cases: cubiertos (título largo, sin coordenadas, id inexistente, exceso de
imágenes, sin permisos, métrica indisponible).
Error states: cubiertos (409 en transición inválida, 422 en comentario, no encontrado).
Pendiente: actualizaciones en vivo vía `realtime` — ver Q2 del diseño; el alcance
inicial es recarga bajo demanda.

## Next

Listo para `sdd-design`. Depende de F0, F1 y F2.
