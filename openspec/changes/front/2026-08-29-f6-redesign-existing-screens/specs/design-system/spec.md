# Spec: F6 — Rediseño de pantallas existentes

## Domain: design-system (MODIFIED — completa la adopción iniciada en F0)

### Requirement: Adopción completa de los primitivos
Las cuatro pantallas preexistentes DEBEN construirse sobre los primitivos de F0, sin
maquetación propia que los duplique.

- Scenario: Sin tablas a medida — GIVEN las pantallas de Usuarios y Roles THEN sus
  listados usan `ui-table`, no marcado de tabla propio
- Scenario: Encabezados uniformes — GIVEN cualquiera de las cuatro pantallas THEN su
  encabezado es `ui-page-header` con kicker y título
- Scenario: Botones uniformes — GIVEN cualquier acción THEN usa `ui-button` con su
  variante, sin clases de color literales en la plantilla
- Scenario: Sin CSS huérfano — GIVEN la migración completa THEN los archivos de estilo
  por componente que quedaron sin reglas se eliminan, no se dejan vacíos

### Requirement: Dashboard según el mock
`/app/dashboard` DEBE presentar los cuatro bloques del mock 01-01.

- Scenario: Tarjetas KPI — GIVEN el dashboard cargado THEN se muestran cinco tarjetas
  de color sólido (total, en proceso, resueltas, pendientes, tiempo promedio), cada una
  con valor, icono y pie de tendencia
- Scenario: Top categorías — GIVEN datos disponibles THEN se muestra el gráfico de
  barras horizontales con las cinco categorías más frecuentes
- Scenario: Actividad reciente — GIVEN incidencias recientes THEN se listan con
  indicador de color, título, estado, prioridad y marcas de tiempo, con enlace al
  historial completo
- Scenario: Rendimiento semanal — GIVEN datos de la semana THEN se muestra el gráfico
  de barras agrupadas de recibidas contra resueltas por día
- Scenario: Métrica indisponible — GIVEN una métrica que la API no devuelve THEN la
  tarjeta muestra un guion, **nunca un valor fijo de ejemplo**
- Scenario: Sin datos — GIVEN un gráfico sin datos THEN se muestra su estado vacío, no
  un lienzo en blanco indistinguible de un fallo de carga

### Requirement: Usuarios según el mock
`/app/admin/users` DEBE seguir los mocks 03-01 y 03-02 conservando su funcionalidad.

- Scenario: Listado — GIVEN la pantalla cargada THEN se muestran los usuarios en
  `ui-table` con búsqueda, filtros y paginación
- Scenario: Formulario — GIVEN alta o edición THEN el formulario sigue el mock 03-02 y
  conserva las validaciones actuales
- Scenario: Permisos — GIVEN un usuario sin `CREATE users` THEN no se renderiza el
  botón de alta
- Scenario: Funcionalidad preservada — GIVEN los specs existentes de la pantalla
  THEN siguen pasando **sin modificarse**

### Requirement: Roles según el mock
`/app/admin/roles` DEBE seguir los mocks 04-01 y 04-02 conservando su funcionalidad.

- Scenario: Listado — GIVEN la pantalla cargada THEN se muestran los roles según el
  mock 04-01
- Scenario: Editor — GIVEN el editor de un rol THEN la asignación de permisos sigue el
  mock 04-02 y conserva el comportamiento actual
- Scenario: Funcionalidad preservada — GIVEN los specs existentes THEN siguen pasando
  sin modificarse

### Requirement: Perfil según el mock
`/app/profile` DEBE seguir el mock 10-01.

- Scenario: Datos y edición — GIVEN la pantalla cargada THEN se muestran los datos del
  usuario y las secciones de configuración del mock
- Scenario: Avatar — GIVEN un usuario sin imagen THEN se muestran sus iniciales sobre
  fondo de marca, patrón heredado del app-shell legacy y resistente a alta densidad
- Scenario: Funcionalidad preservada — GIVEN los specs existentes THEN siguen pasando
  sin modificarse

### Requirement: Retirada del andamiaje de compatibilidad
El bloque `:root` de compatibilidad introducido en F0 DEBE eliminarse una vez sin
consumidores.

- Scenario: Verificación previa — GIVEN la migración completa WHEN se buscan
  `--primary-color`, `--accent-color`, `--dark-text`, `--muted-text` THEN no hay
  coincidencias fuera de su propia declaración
- Scenario: Eliminación — GIVEN la verificación en cero THEN el bloque se elimina y la
  aplicación compila y renderiza igual
- Scenario: Consumidores restantes — GIVEN que alguna referencia sobrevive THEN el
  bloque **se conserva** y se documenta qué la usa; no se elimina a ciegas

## Coverage

Happy paths: cubiertos (las cuatro pantallas migradas, dashboard completo).
Edge cases: cubiertos (métrica indisponible, gráfico sin datos, avatar sin imagen,
andamiaje con consumidores restantes).
Error states: heredados de las pantallas actuales; F6 no cambia comportamiento, y esa
invariancia se verifica exigiendo que los specs existentes pasen sin editarse.

## Next

Última fase del plan. Depende de F0 y F2.
