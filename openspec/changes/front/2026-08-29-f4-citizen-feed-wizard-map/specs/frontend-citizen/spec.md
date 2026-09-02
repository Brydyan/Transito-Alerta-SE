# Spec: F4 Fase B — Feed, asistente de reporte y mapa

## Domain: frontend-citizen (NEW — depende de la Fase A integrada)

### Requirement: Feed de incidencias
`/app/inicio` DEBE presentar las incidencias como tarjetas cronológicas con las
acciones sociales del mock 09-01.

- Scenario: Carga inicial — GIVEN un usuario autenticado THEN se muestran las
  incidencias más recientes como tarjetas con autor, ubicación, antigüedad relativa,
  badges de estado y prioridad, título, código, etiquetas, coordenadas y acciones
- Scenario: Carga incremental — GIVEN el usuario llega al final de la lista THEN se
  carga la página siguiente sin perder la posición de desplazamiento
- Scenario: Fin del feed — GIVEN no hay más incidencias THEN se muestra el estado
  final «Has visto todas las incidencias recientes», no un cargador perpetuo
- Scenario: Feed vacío — GIVEN ninguna incidencia coincide con los filtros THEN se
  renderiza `empty-state` con acción para limpiar filtros
- Scenario: Composer — GIVEN el campo superior «¿Qué incidencia deseas reportar hoy?»
  WHEN se activa THEN se navega al asistente de reporte

### Requirement: Acciones sociales en la tarjeta
Cada tarjeta DEBE ofrecer seguir, corroborar y ver detalle, con realimentación inmediata.

- Scenario: Seguir — GIVEN una tarjeta no seguida WHEN se pulsa «Seguir» THEN el
  control pasa a estado seguido y el conteo aumenta antes de la confirmación del servidor
- Scenario: Fallo al seguir — GIVEN el servidor responde con error THEN el estado
  optimista se revierte y se informa el fallo
- Scenario: Corroborar — GIVEN una incidencia no corroborada WHEN se pulsa «Yo también
  reporto» THEN se registra y el control queda deshabilitado de forma permanente
- Scenario: Ya corroborada — GIVEN `is_corroborated_by_me` es verdadero al cargar
  THEN el control aparece deshabilitado desde el inicio
- Scenario: Autor — GIVEN el usuario es el autor de la incidencia THEN no se ofrece
  corroborar
- Scenario: Ver mapa — GIVEN una tarjeta con coordenadas WHEN se pulsa «Ver Mapa»
  THEN se abre el mapa centrado en ese punto

### Requirement: Filtros del feed
El panel lateral DEBE permitir filtrar por estado y por categoría jerárquica.

- Scenario: Filtro por estado — GIVEN los chips `Todo|En proceso|Pendiente|Resuelto`
  WHEN se elige uno THEN el feed se recarga filtrado y el chip queda marcado
- Scenario: Categoría con subcategorías — GIVEN una categoría con hijos WHEN se marca
  la categoría padre THEN se incluyen todas sus subcategorías
- Scenario: Subcategoría suelta — GIVEN sólo una subcategoría marcada THEN el padre
  se muestra en estado indeterminado, no marcado
- Scenario: Estadísticas del día — GIVEN el panel lateral THEN muestra nuevas hoy,
  resueltas hoy y promedio de resolución
- Scenario: Ranking de zonas — GIVEN el panel lateral THEN muestra las zonas con más
  incidencias, ordenadas y numeradas

### Requirement: Asistente de reporte en cuatro pasos
`/app/reportar` DEBE guiar el alta de una incidencia en los cuatro pasos del mock.

- Scenario: Paso 1 — GIVEN el asistente recién abierto THEN se piden título,
  prioridad sugerida y descripción inicial, y no se avanza sin los obligatorios
- Scenario: Paso 2 — GIVEN el paso de categorización THEN se elige categoría y se
  adjuntan archivos, comprimidos en cliente antes de subir
- Scenario: Paso 3 — GIVEN el paso de ubicación THEN se ofrece mapa interactivo y
  detección de posición actual
- Scenario: Paso 4 — GIVEN el paso de revisión THEN se muestra el resumen completo y
  el envío definitivo
- Scenario: Navegación hacia atrás — GIVEN el paso 3 WHEN se retrocede THEN los datos
  de los pasos anteriores se conservan
- Scenario: Indicador de progreso — GIVEN cualquier paso THEN el indicador señala el
  actual y los completados
- Scenario: Borrador persistido — GIVEN datos capturados WHEN se recarga la página
  THEN el asistente se restaura en el mismo paso con los datos previos
- Scenario: Envío exitoso — GIVEN el paso 4 confirmado THEN se crea la incidencia, se
  descarta el borrador y se navega a su detalle
- Scenario: Fallo de envío — GIVEN el servidor rechaza el envío THEN el borrador se
  conserva y el error se muestra sin perder lo capturado

### Requirement: Captura de ubicación
El paso 3 DEBE permitir fijar coordenadas por geolocalización o manualmente sobre el mapa.

- Scenario: Posición detectada — GIVEN permiso de ubicación concedido THEN el mapa se
  centra en la posición actual y coloca el marcador
- Scenario: Permiso denegado — GIVEN el usuario deniega el permiso THEN se permite
  fijar el punto manualmente sobre el mapa, sin bloquear el flujo
- Scenario: Ajuste manual — GIVEN un marcador colocado WHEN se arrastra THEN las
  coordenadas se actualizan
- Scenario: Ubicación obligatoria — GIVEN ningún punto fijado THEN no se avanza al
  paso 4

### Requirement: Mapa a pantalla completa
`/app/mapa` DEBE mostrar las incidencias georreferenciadas con agrupación y filtros.

- Scenario: Carga — GIVEN el mapa abierto THEN se muestran las incidencias con
  coordenadas, agrupadas por proximidad con su conteo visible
- Scenario: Expandir grupo — GIVEN un grupo WHEN se acerca el zoom THEN se separa en
  sus marcadores individuales
- Scenario: Marcador — GIVEN un marcador WHEN se activa THEN se muestra un resumen con
  enlace al detalle
- Scenario: Filtros — GIVEN el panel flotante THEN permite filtrar por estado,
  prioridad y categoría, y limpiar todo de una vez
- Scenario: Contador — GIVEN cualquier estado de filtrado THEN se indica cuántas
  incidencias se están mostrando y cuándo se actualizó
- Scenario: Sin resultados — GIVEN filtros que no arrojan incidencias THEN el mapa se
  muestra vacío con aviso explícito, no como un fallo de carga

## Coverage

Happy paths: cubiertos (feed, acciones, filtros, cuatro pasos, mapa).
Edge cases: cubiertos (fin del feed, autor sin corroborar, subcategoría indeterminada,
permiso de ubicación denegado, recarga a medio asistente, mapa sin resultados).
Error states: cubiertos (reversión optimista, fallo de envío conservando borrador).
Pendiente: envío diferido sin conexión — ver Q2 del diseño.

## Next

Requiere la Fase A integrada. Depende además de F0, F1 y F3.
