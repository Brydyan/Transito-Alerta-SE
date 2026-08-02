# 📋 Plan de Gestión de Calidad de Software
## Proyecto: Sistema Web de Gestión de Incidencias Georreferenciadas

Este Plan de Calidad de Software (SQAP) ha sido estructurado tomando como referencia el estándar internacional **ISO/IEC 25000 (SQuaRE)** para la evaluación de atributos de calidad de producto, y los fundamentos de la Gestión de la Calidad en el Desarrollo de Software, dividiendo las acciones en Aseguramiento de Calidad (QA) y Control de Calidad (QC).

Cada objetivo de este plan se alinea directamente con los criterios de evaluación de la rúbrica de la asignatura **Calidad de Software (20%)**, garantizando trazabilidad entre las actividades planificadas y la evidencia exigida por el tribunal evaluador.

---

## 1. Propósito y Alcance

### 1.1. Propósito
Establecer un marco de trabajo formal para guiar las actividades de prevención, medición y corrección de defectos dentro del proyecto integrador. El fin primordial es asegurar que el software entregado cumpla de manera estricta con los requisitos funcionales, de rendimiento y de calidad establecidos en las rúbricas de evaluación, cubriendo los criterios de la asignatura de **Calidad de Software**.

### 1.2. Alcance del Plan
Este plan regula de forma transversal todos los componentes y tecnologías del sistema:

| Componente | Tecnología | Rol Responsable |
| :--- | :--- | :--- |
| **Frontend (UI/UX)** | HTML, CSS, Bootstrap, JavaScript (Fetch API) | Especialista en Frontend |
| **Backend (API REST)** | Laravel | Especialista en Backend |
| **Base de Datos** | MySQL / PostgreSQL | Especialista en Infraestructura y BD |
| **Despliegue (Deploy)** | Docker / Docker Compose | Especialista en Infraestructura y BD |

### 1.3. Alcance del Sistema a Validar
El plan cubre la validación detallada de las siguientes funcionalidades del sistema:
* **Gestión de incidencias:** CRUD completo (creación, lectura, actualización y eliminación).
* **Estados e Historial:** Flujo y transiciones de estados, registro histórico de cambios.
* **Asignación de responsables:** Vinculación de usuarios responsables y de apoyo a las incidencias.
* **Sistemas de comentarios:** Registro y visualización de comentarios cronológicos por incidencia.
* **Ubicación georreferenciada:** Selección jerárquica de ubicación (País → Provincia → Ciudad).
* **Clasificación jerárquica:** Categorización mediante tipos y subtipos de incidencias.
* **Sistemas de notificaciones:** Notificaciones internas generadas por cambios de estado y asignación.
* **Dashboards y métricas:** Visualización de gráficos estadísticos y contadores generales de las incidencias.
* **Consultas y filtros:** Filtros avanzados en el dashboard (rango de fechas, tipo, ubicación).

---

## 2. Referencias Normativas

| Estándar | Descripción |
| :--- | :--- |
| **ISO/IEC 25000 (SQuaRE)** | Marco de referencia para la evaluación de características de calidad de producto de software. |
| **ISO/IEC 25010** | Define el modelo de calidad: características y sub-características evaluables (Adecuación Funcional, Fiabilidad, Eficiencia de Rendimiento, Portabilidad). |
| **ISO/IEC 29119** | Estándar internacional para pruebas de software, incluyendo el diseño de casos de prueba. |
| **IEEE 730** | Lineamientos para la elaboración de Planes de Aseguramiento de Calidad del Software (SQAP). |
| **IEEE 829** | Estándar para la documentación y estructuración de pruebas de software. |
| **PSR-12** | Guía de estilos de codificación para PHP adoptada por la comunidad Laravel. |

---

## 3. Roles y Responsabilidades en el Ciclo de Calidad

### 3.1. Distribución de Responsabilidades de Calidad
Para un equipo de 3 personas, definimos la siguiente distribución clara de responsabilidades:

| Rol | Área de Responsabilidad | Capa / ID de Validaciones |
| :--- | :--- | :--- |
| **Especialista en Frontend** | Validaciones en formularios (HTML5 + JS), verificación de responsividad, pruebas de integración visual, capturas de pantalla de la interfaz y visualización del dashboard. | `CP-XX-F` (Frontend) |
| **Especialista en Backend** | Validaciones de API con Postman, manejo de errores y códigos HTTP, lógica de negocio de los estados, endpoints REST y medición de métricas de rendimiento. | `CP-XX-B` (Backend) |
| **Especialista en Infraestructura y BD** | Integridad referencial física, normalización a Tercera Forma Normal (3FN), pruebas de consultas SQL complejas, backup, persistencia en Docker y triggers de historial. | `CP-XX-BD` (Base de Datos) |

### 3.2. Responsabilidades Compartidas
Todas las actividades de testing funcional, recolección de evidencias gráficas y documentación final deben ser realizadas de manera colaborativa y conjunta por los 3 integrantes del equipo.

---

## 4. Objetivos de Calidad

Los seis objetivos de este plan se mapean directamente con los criterios de la rúbrica de **Calidad de Software (20 puntos)** y se sustentan en las características del modelo **ISO/IEC 25010**:

| # | Objetivo | Criterio Rúbrica | Característica ISO 25010 | Puntaje |
| :--- | :--- | :--- | :--- | :---: |
| **O1** | Validaciones del sistema | Validaciones del sistema | Adecuación Funcional — Corrección | 4 |
| **O2** | Casos de prueba funcionales | Casos de prueba funcionales | Adecuación Funcional — Completitud | 4 |
| **O3** | Evidencias de testing | Evidencias de testing | Fiabilidad — Madurez | 4 |
| **O4** | Pruebas de carga o estrés | Pruebas de carga o estrés | Eficiencia de Rendimiento | 3 |
| **O5** | Uso de herramientas de calidad | Uso de herramientas de calidad | Mantenibilidad — Analizabilidad | 3 |
| **O6** | Métricas e indicadores | Métricas e indicadores | Adecuación Funcional — Completitud | 2 |
| | | | **Total** | **20** |

---

## 5. Criterios y Estándares de Calidad

Para que un componente sea declarado **"Apto para Producción"**, debe satisfacer los siguientes estándares técnicos mínimos:

* **Estándar de Código (PHP / PSR-12):** Cumplimiento de la guía de estilos PSR-12, verificado y unificado de forma automatizada mediante **Laravel Pint**.
* **Estándar de Arquitectura de Datos:** Base de datos completamente normalizada bajo la **Tercera Forma Normal (3FN)** para la segmentación de entidades de ubicación (País, Provincia, Ciudad), garantizando la integridad referencial mediante llaves foráneas.
* **Estándar de Comunicación (API REST):** Consumo asíncrono estricto mediante la Fetch API de JavaScript. Los endpoints deben responder con códigos HTTP estándar: `200/201` operaciones exitosas, `422` fallos de validación, `500` excepciones internas.
* **Estándar de Rendimiento:** Tiempo promedio de respuesta del servidor < 2.0 segundos bajo carga concurrente básica.
* **Estándar de Evidencias:** Todo resultado de prueba debe documentarse con captura de pantalla o reporte exportado antes de la sustentación técnica final.

---

## 6. Ciclo de Testing y Actividades (QA vs. QC)

### 6.1. Actividades de Aseguramiento de Calidad (QA — Preventivas)
* **Diseño del Contrato de Datos (Mocking):** Definición previa de estructuras JSON de entrada y salida antes de iniciar el desarrollo. Mitiga errores de acoplamiento entre Frontend y Backend y permite desarrollo en paralelo.
* **Revisiones de Código de Pares (Code Review):** Inspección cruzada de la lógica de código entre integrantes antes de autorizar la fusión de ramas en Git.
* **Verificación Estática con Laravel Pint:** Ejecución automatizada de la herramienta para garantizar cumplimiento del estándar PSR-12 en todo el código PHP del proyecto *(cubre O5)*.

### 6.2. Actividades de Control de Calidad (QC — Correctivas)
Las pruebas se ejecutan de forma incremental siguiendo el ciclo de vida del software:
1. **Pruebas de Validación (Backend):** Verificación de que los endpoints rechacen correctamente peticiones malformadas, retornando HTTP `422` con mensajes de error descriptivos *(cubre O1)*.
2. **Pruebas de Validación (Frontend):** Verificación de que los formularios bloqueen el envío ante campos vacíos o con formato incorrecto antes de realizar el Fetch *(cubre O1)*.
3. **Pruebas Funcionales del Sistema:** Ejecución de la Matriz de Casos de Prueba sobre los flujos principales: registro, edición, cambio de estado, historial, comentarios y notificaciones *(cubre O2)*.
4. **Pruebas de Integración (API ↔ Frontend):** Verificación de que el JavaScript Fetch inyecte correctamente datos dinámicos en tablas y gráficos (ApexCharts) *(cubre O2 y O3)*.
5. **Pruebas de Rendimiento (Carga / Estrés):** Simulación de solicitudes concurrentes sobre endpoints críticos para evaluar estabilidad del entorno contenerizado *(cubre O4)*.

### 6.3. Recolección de Evidencias (QC — Documentación)
Toda prueba ejecutada genera evidencia documentada obligatoria *(cubre O3)*:
* Capturas de pantalla de respuestas HTTP en Postman (validaciones y errores).
* Tabla de casos de prueba con estado "Aprobado" / "Fallido" y observaciones.
* Reporte gráfico de la herramienta de pruebas de carga (latencia, throughput).
* Capturas de la consola del navegador mostrando ausencia de `Uncaught Errors`.

---

## 7. Plan de Testing Funcional

### 7.1. Formato Estructurado
Cada caso de prueba sigue el formato estándar: `CP-XX-YY-Z`

| Componente | Significado | Valores Posibles |
| :--- | :--- | :--- |
| **CP** | Prefijo estándar de Caso de Prueba | `CP` |
| **XX** | Número del módulo (01-10) | `01`, `02`, `03` ... `10` |
| **YY** | Sub-caso dentro del módulo (01-99) | `01`, `02`, `03` ... |
| **Z** | Capa de validación | `F` = Frontend, `B` = Backend, `BD` = Base de Datos |

### 7.2. Ejemplo de Nomenclatura
| ID | Significado |
| :--- | :--- |
| **CP-01-01-F** | Módulo 01 (Incidencias), Sub-caso 01, validación en Frontend. |
| **CP-01-01-B** | Módulo 01 (Incidencias), Sub-caso 01, validación en Backend. |
| **CP-03-02-BD** | Módulo 03 (Responsables), Sub-caso 02, validación en Base de Datos. |
| **CP-09-01-F** | Módulo 09 (Autenticación), Sub-caso 01, validación en Frontend. |

### 7.3. Principio de Validación Dual
Cada funcionalidad debe ser probada en al menos dos capas para garantizar una cobertura completa:

| Capa | Propósito | Validaciones Típicas | Herramientas |
| :--- | :--- | :--- | :--- |
| **Frontend (F)** | Experiencia de usuario, feedback inmediato. | Bloqueo de campos, mensajes de error visuales, formato de entrada, responsividad. | Inspección manual, Chrome DevTools |
| **Backend (B)** | Seguridad, integridad de datos. | Tipos de datos, rangos válidos, claves foráneas, transacciones, códigos HTTP. | Postman, cURL, Laravel Form Requests |
| **Base de Datos (BD)** | Integridad estructural, consultas optimizadas. | FK, normalización, triggers, procedimientos almacenados, consultas agregadas. | MySQL Workbench, PostgreSQL CLI |

---

## 8. Matriz de Casos de Prueba

### 8.01. Modulo 01: Gestión de incidencias
Descipción: validación del ciclo completo de vida de una incidencia.

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-01-01-F | Formulario completo con todos los campos válidos | Frontend | 1. Llenar título "Fuga de agua"<br>2. Llenar descripción "Tubería rota en calle principal"<br>3. Seleccionar prioridad "Alta"<br>4. Seleccionar ubicación (País→Provincia→Ciudad)<br>5. Seleccionar tipo/subtipo<br>6. Click en "Guardar" | Título: "Fuga de agua"<br>Descripción: "Tubería rota en calle principal"<br>Prioridad: Alta | Botón se deshabilita, loading aparece, luego mensaje de éxito y redirección a lista | Integrante 1 |
| CP-01-01-B | Endpoint recibe y guarda datos correctamente | Backend | Enviar POST /api/incidencias con payload JSON válido | { "titulo": "Fuga de agua", "descripcion": "Tubería rota...", "prioridad_id": 1, "ubicacion_id": 5, "tipo_id": 1, "subtipo_id": 3 } | HTTP 201, respuesta incluye id de incidencia creada, registros en tablas relacionadas | Integrante 2 |
| CP-01-02-F | Campo título vacío muestra error en UI | Frontend | 1. Dejar campo título completamente vacío<br>2. Llenar demás campos obligatorios<br>3. Intentar guardar | Título: (vacío) | Mensaje "El campo título es obligatorio" aparece debajo del campo en color rojo, botón deshabilitado | Integrante 1 |
| CP-01-02-B | Endpoint rechaza título vacío con HTTP 422 | Backend | Enviar POST /api/incidencias sin campo título | Payload sin campo "titulo" | HTTP 422, "errors": {"titulo": ["El campo título es obligatorio"]} | Integrante 2 |
| CP-01-03-F | Input teléfono solo acepta números | Frontend | 1. Ir a campo teléfono<br>2. Intentar escribir letras "abc"<br>3. Escribir números "1234567890" | Intento: escribir "abc123" | Solo aparecen "123" en el campo, letras son bloqueadas inmediatamente | Integrante 1 |
| CP-01-03-B | Backend valida formato teléfono con regex | Backend | Enviar teléfono con letras via Postman | "telefono_contacto": "abc1234567890" | HTTP 422, "errors": {"telefono_contacto": ["El formato del teléfono es inválido"]} | Integrante 2 |
| CP-01-04-F | Editar incidencia existente carga datos en formulario | Frontend | 1. Ir a lista de incidencias<br>2. Click en botón "Editar" de una incidencia<br>3. Modificar título<br>4. Click en "Guardar" | Título original: "Fuga"<br>Nuevo título: "Fuga de agua reportada" | Campos se precargan con datos actuales, cambios se reflejan en lista, mensaje de éxito | Integrante 1 |
| CP-01-04-B | Endpoint PUT actualiza correctamente en BD | Backend | Enviar PUT /api/incidencias/{id} con datos modificados | { "titulo": "Fuga de agua reportada", ... } | HTTP 200, registro actualizado en tabla incidencias, timestamps modificados | Integrante 2 |
| CP-01-05-F | Modal de confirmación antes de eliminar | Frontend | 1. Ir a incidencia específica<br>2. Click en botón "Eliminar"<br>3. No confirmar el modal | Click en eliminar | Modal aparece con mensaje "¿Está seguro de eliminar esta incidencia?" y botones "Cancelar" y "Eliminar" | Integrante 1 |
| CP-01-06-F | Eliminación exitosa tras confirmar modal | Frontend | 1. Click en "Eliminar"<br>2. Confirmar en modal | Confirmar eliminación | Incidencia desaparece de la lista, toast/mensaje de éxito aparece | Integrante 1 |
| CP-01-06-B | Endpoint DELETE elimina lógicamente (soft delete) | Backend | Enviar DELETE /api/incidencias/{id} | - | HTTP 200, campo deleted_at actualizado, incidencia no aparece en consultas normales | Integrante 2 |

### 8.02. Modulo 02: Estados e historial
Descripción: Validación del flujo de cambios de estado y registro histórico completo.

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-02-01-F | Dropdown muestra todos los estados disponibles | Frontend | 1. Abrir incidencia existente<br>2. Localizar selector de estado | - | Dropdown muestra: Pendiente, En Proceso, Resuelto, Cerrado (según flujo definido) | Integrante 1 |
| CP-02-01-B | Endpoint retorna estados válidos desde BD | Backend | GET /api/estados | - | JSON: [{ "id": 1, "nombre": "Pendiente" }, { "id": 2, "nombre": "En Proceso" }, ...] | Integrante 2 |
| CP-02-02-F | Cambiar estado de Pendiente → En Proceso | Frontend | 1. Incidencia con estado "Pendiente"<br>2. Seleccionar "En Proceso" del dropdown<br>3. Click en "Guardar Estado" | Estado actual: Pendiente<br>Nuevo estado: En Proceso | Badge/color del estado cambia, pestaña historial se actualiza automáticamente | Integrante 1 |
| CP-02-02-B | PUT estado crea registro en historial con timestamp | Backend | PUT /api/incidencias/{id}/estado | { "estado_id": 2, "comentario": "Iniciando revisión técnica" } | HTTP 200, nuevo registro en tabla historial_estados con usuario_id, fecha, estado_anterior, estado_nuevo | Integrante 2 |
| CP-02-03-F | Visualización de historial cronológico completo | Frontend | 1. Ir a pestaña "Historial" de una incidencia<br>2. Ver lista de cambios | - | Lista ordenada cronológicamente (más reciente primero), muestra: estado anterior → nuevo, usuario responsable, fecha y hora | Integrante 1 |
| CP-02-03-B | GET historial retorna datos ordenados por fecha | Backend | GET /api/incidencias/{id}/historial | - | Array JSON ordenado por created_at DESC, incluye: estado_origen, estado_destino, usuario, timestamp, comentario | Integrante 2 |
| CP-02-04-F | Validación de flujo de estados (no permite estados inválidos) | Frontend | 1. Ver opciones disponibles según estado actual<br>2. Intentar seleccionar un estado no permitido por flujo | Ejemplo: Intentar cambiar "Pendiente" → "Cerrado" si no está permitido | Opción no aparece en dropdown o aparece deshabilitada con tooltip "No permitido" | Integrante 1 |
| CP-02-05-F | Fecha de resolución visible al marcar como Resuelto | Frontend | 1. Cambiar estado a "Resuelto"<br>2. Observar datos mostrados | Estado: Resuelto | Campo "Fecha resolución: [dd/mm/aaaa hh:mm]" visible, tooltip muestra fecha completa | Integrante 1 |
| CP-02-05-B | Fecha resolución guardada correctamente en BD | Backend | Consultar incidencia con estado "Resuelto" | - | Campo fecha_resolucion en tabla incidencias tiene timestamp válido, coincide con último cambio de estado | Integrante 3 |
| CP-02-06-BD | Trigger automático que genera registro de historial | BD | Cambiar estado de incidencia via SQL | UPDATE incidencias SET estado_id = 3 WHERE id = 1 | Nuevo registro insertado en tabla historial_estados con todos los campos requeridos | Integrante 3 |

### 8.03. Módulo 03: Asignación responsable
Descripción: Validación de asignación de uno o varios usuarios con roles diferenciados.

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-03-01-F | Selector de usuarios con búsqueda/filtrado | Frontend | 1. Ir a sección "Asignar responsable"<br>2. Escribir parte del nombre en campo de búsqueda | "Juan" | Lista muestra únicamente usuarios que contienen "Juan" en nombre o apellido | Integrante 1 |
| CP-03-01-B | Endpoint retorna usuarios filtrados por búsqueda | Backend | GET /api/usuarios?buscar=Juan | - | JSON con usuarios que coinciden: [{ "id": 5, "nombre": "Juan Pérez", ... }] | Integrante 2 |
| CP-03-02-F | Asignar un responsable con rol específico | Frontend | 1. Seleccionar usuario "Juan Pérez"<br>2. Definir rol como "Responsable"<br>3. Click en "Asignar" | Usuario: Juan Pérez<br>Rol: Responsable | Badge/pill muestra "Juan Pérez - Responsable" con color/icono diferenciado | Integrante 1 |
| CP-03-02-B | Relación guardada en tabla pivote | Backend | POST /api/incidencias/{id}/responsables | { "usuario_id": 5, "rol": "responsable" } | HTTP 200, nuevo registro en tabla incidencia_usuario con incidencia_id, usuario_id, rol, timestamps | Integrante 2 |
| CP-03-03-F | Asignar múltiples responsables con diferentes roles | Frontend | 1. Asignar Juan como "Responsable"<br>2. Agregar María como "Apoyo"<br>3. Ver lista de responsables | Juan (Responsable), María (Apoyo) | Lista muestra ambos con roles diferenciados: badge verde para Responsable, badge azul para Apoyo | Integrante 1 |
| CP-03-03-B | Múltiples registros en tabla pivote con roles diferentes | Backend | Verificar BD después de múltiples asignaciones | - | Tabla incidencia_usuario tiene 2 registros: uno con rol="responsable", otro con rol="apoyo", ambos con FK correctas | Integrante 3 |
| CP-03-04-F | Cambiar rol de responsable existente | Frontend | 1. Ir a responsable "Juan"<br>2. Cambiar selector de rol a "Apoyo"<br>3. Guardar | Rol actual: Responsable<br>Nuevo rol: Apoyo | Badge actualizado: "Juan - Apoyo", historial de cambio registrado | Integrante 1 |
| CP-03-04-B | PUT actualiza rol en tabla pivote | Backend | PUT /api/incidencias/{id}/responsables/{usuario_id} | { "rol": "apoyo" } | HTTP 200, campo rol actualizado, timestamp modificado | Integrante 2 |
| CP-03-05-F | Eliminar responsable de incidencia | Frontend | 1. Click en icono "X" junto a responsable<br>2. Confirmar eliminación | - | Responsable removido de la lista, badge desaparece | Integrante 1 |
| CP-03-05-B | DELETE/remover relación de tabla pivote | Backend | DELETE /api/incidencias/{id}/responsables/{usuario_id} | - | HTTP 200, registro eliminado de tabla pivote | Integrante 2 |

### 8.04. Modulo 04: Sistemas de comentarios
Descripción: Validación del registro y visualización de comentarios por incidencia.

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-04-01-F | Agregar comentario con texto válido | Frontend | 1. Ir a sección "Comentarios" de una incidencia<br>2. Escribir "Problema reportado al municipio"<br>3. Click en botón "Comentar" | Texto: "Problema reportado al municipio" | Comentario aparece en lista con: texto, autor (nombre del usuario logueado), fecha y hora relativa ("Hace 2 minutos") | Integrante 1 |
| CP-04-01-B | POST crea comentario con usuario y timestamps | Backend | POST /api/incidencias/{id}/comentarios | { "texto": "Problema reportado al municipio" } | HTTP 201, registro creado en tabla comentarios con: id, incidencia_id, usuario_id, texto, created_at, updated_at | Integrante 2 |
| CP-04-02-F | Comentario vacío rechazado en frontend | Frontend | 1. Dejar campo de texto completamente vacío<br>2. Intentar hacer click en "Comentar" | Texto: (vacío) | Botón "Comentar" permanece deshabilitado, o mensaje de error aparece al intentar enviar | Integrante 1 |
| CP-04-02-B | Backend rechaza texto vacío con validación | Backend | POST /api/incidencias/{id}/comentarios con texto vacío | { "texto": "" } | HTTP 422, "errors": {"texto": ["El campo texto es obligatorio"]} | Integrante 2 |
| CP-04-03-F | Contador de caracteres visible y funcional | Frontend | 1. Escribir texto en textarea de comentarios<br>2. Observar contador | - | Contador muestra formato "X/1000" y cambia en tiempo real, cambia a rojo cuando se acerca al límite | Integrante 1 |
| CP-04-04-F | Ver comentarios ordenados por fecha (más reciente primero) | Frontend | 1. Agregar comentario A<br>2. Esperar 10 segundos<br>3. Agregar comentario B<br>4. Ver lista | Comentario A: "Primero"<br>Comentario B: "Segundo" | Comentario B aparece primero (más reciente), seguido de A | Integrante 1 |
| CP-04-04-B | GET retorna comentarios ordenados por created_at DESC | Backend | GET /api/incidencias/{id}/comentarios | - | Array JSON ordenado por created_at DESC, incluye datos completos del comentario | Integrante 2 |
| CP-04-05-F | Eliminar propio comentario | Frontend | 1. Ver comentario creado por el usuario actual<br>2. Click en icono "Eliminar" del comentario<br>3. Confirmar | - | Comentario desaparece de la lista, toast de confirmación | Integrante 1 |
| CP-04-05-B | DELETE soft delete del comentario | Backend | DELETE /api/comentarios/{id} | - | HTTP 200, campo deleted_at actualizado, comentario no visible en consultas normales | Integrante 2 |

### 8.05. Modulo 05: Ubicación Georreferenciada
Descripción: Validación de selección jerárquica de ubicación (País → Provincia → Ciudad)

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-05-01-F | Selección en cascada: país carga provincias | Frontend | 1. Seleccionar país "Argentina" en dropdown<br>2. Esperar carga<br>3. Ver opciones del segundo dropdown | País: Argentina | Segundo dropdown (Provincias) se habilita y muestra opciones: Buenos Aires, Córdoba, Santa Fe, Mendoza, etc. | Integrante 1 |
| CP-05-01-B | Endpoint retorna provincias filtradas por país | Backend | GET /api/provincias?pais_id=1 | - | JSON con provincias del país seleccionado: [{ "id": 1, "nombre": "Buenos Aires" }, ...] | Integrante 2 |
| CP-05-02-F | Selección completa en cascada: País → Provincia → Ciudad | Frontend | 1. Seleccionar "Argentina"<br>2. Seleccionar "Buenos Aires"<br>3. Esperar carga<br>4. Ver opciones de ciudades | País: Argentina<br>Provincia: Buenos Aires | Tercer dropdown (Ciudades) se habilita y muestra: La Plata, Mar del Plata, Bahía Blanca, etc. | Integrante 1 |
| CP-05-02-B | Endpoint retorna ciudades filtradas por provincia | Backend | GET /api/ciudades?provincia_id=1 | - | JSON con ciudades de la provincia seleccionada | Integrante 2 |
| CP-05-03-F | Cambio de provincia limpia ciudad seleccionada | Frontend | 1. Seleccionar Argentina → Buenos Aires → La Plata<br>2. Cambiar provincia a "Córdoba"<br>3. Observar dropdown de ciudad | Ciudad previamente seleccionada: La Plata | Dropdown de ciudad se limpia automáticamente, muestra mensaje "Seleccione una ciudad" | Integrante 1 |
| CP-05-03-B | Backend valida relación provincia-ciudad en FK | Backend | Intentar asignar ciudad_id de provincia diferente | ciudad_id: 100 (pertenece a otra provincia) | HTTP 422, error de validación de integridad referencial | Integrante 2 |
| CP-05-04-F | Campo ubicación muestra valor seleccionado completo | Frontend | 1. Completar selección: Argentina / Buenos Aires / La Plata<br>2. Guardar incidencia<br>3. Ver en detalle | - | Campo ubicación muestra texto legible: "Argentina > Buenos Aires > La Plata" | Integrante 1 |
| CP-05-04-BD | Tablas normalizadas sin redundancia de datos | BD | Verificar estructura de tablas de ubicación | - | Tablas separadas: paises (id, nombre), provincias (id, nombre, pais_id), ciudades (id, nombre, provincia_id). FK correctas en cada nivel. Sin datos duplicados. | Integrante 3 |

### 8.06. Modulo 06: Clasificación Jerarquica.
Descripción: Validación de selección jerárquica de tipo y subtipo de incidencia

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-06-01-F | Dropdown muestra tipos de incidencia activos | Frontend | 1. Ir a campo "Tipo de Incidencia"<br>2. Abrir dropdown | - | Dropdown muestra opciones: Infraestructura, Seguridad, Servicios Públicos, Medio Ambiente, Otro | Integrante 1 |
| CP-06-01-B | Endpoint retorna tipos ordenados alfabéticamente | Backend | GET /api/tipos | - | JSON con tipos ordenados: [{ "id": 1, "nombre": "Infraestructura" }, ...] | Integrante 2 |
| CP-06-02-F | Subtipo depende del tipo seleccionado (cascada) | Frontend | 1. Seleccionar "Infraestructura" en campo Tipo<br>2. Esperar carga<br>3. Abrir dropdown de Subtipo | Tipo: Infraestructura | Dropdown de Subtipo se habilita y muestra: Alumbrado Público, Baches, Semáforos, Vallas, Drenaje | Integrante 1 |
| CP-06-02-B | Endpoint retorna subtipos filtrados por tipo | Backend | GET /api/subtipos?tipo_id=1 | - | JSON con subtipos del tipo seleccionado: [{ "id": 1, "nombre": "Alumbrado Público" }, ...] | Integrante 2 |
| CP-06-03-F | Cambio de tipo limpia subtipo seleccionado | Frontend | 1. Seleccionar Infraestructura → Alumbrado Público<br>2. Cambiar Tipo a "Seguridad"<br>3. Observar Subtipo | Subtipo previamente seleccionado: Alumbrado Público | Campo Subtipo se limpia automáticamente, muestra "Seleccione un subtipo" | Integrante 1 |
| CP-06-03-B | Backend valida que subtipo pertenezca al tipo | Backend | Intentar asignar subtipo_id de tipo diferente | subtipo_id: 10 (pertenece a otro tipo) | HTTP 422, error de validación de relación jerárquica | Integrante 2 |
| CP-06-04-BD | Integridad referencial entre tipos y subtipos | BD | Verificar constraints de FK | - | Tabla subtipos tiene FK a tipos, no permite insertar subtipo con tipo_id inexistente | Integrante 3 |

### 8.07. Modulo 07: Sistemas de notificaciones
Descripción: Validación de creación y gestión de notificaciones del sistema

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-07-01-F | Badge muestra contador de notificaciones no leídas | Frontend | 1. Usuario tiene 3 notificaciones sin leer<br>2. Observar icono de campana en navbar | - | Badge/número rojo muestra "3" junto al icono de campana | Integrante 1 |
| CP-07-02-F | Click en notificación la marca como leída | Frontend | 1. Click en notificación no leída<br>2. Verificar badge | - | Badge decrementa (ejemplo: 3 → 2), notificación cambia estilo (fondo gris a blanco) | Integrante 1 |
| CP-07-02-B | PATCH actualiza campo leido a true | Backend | PATCH /api/notificaciones/{id} | { "leido": true } | HTTP 200, campo leido actualizado a true, timestamp leido_en registrado | Integrante 2 |
| CP-07-03-F | Panel desplegable muestra lista de notificaciones | Frontend | 1. Click en icono de campana<br>2. Ver panel | - | Panel se despliega con lista de notificaciones, cada una muestra: icono de tipo, mensaje resumido, tiempo relativo | Integrante 1 |
| CP-07-04-BD | Trigger/Evento crea notificación al cambiar estado | BD | 1. Asignar incidencia a usuario<br>2. Cambiar estado de la incidencia | - | Tabla notificaciones tiene nuevo registro: usuario_id (destinatario), tipo (cambio estado), incidencia_id, leido=false, timestamps | Integrante 3 |
| CP-07-05-F | Botón "Marcar todas como leídas" funciona | Frontend | 1. Tener múltiples notificaciones sin leer<br>2. Click en "Marcar todas como leídas" | - | Todas las notificaciones cambian a estado leído, badge desaparece o muestra 0 | Integrante 1 |
| CP-07-05-B | PATCH masivo actualiza todas las notificaciones | Backend | PATCH /api/notificaciones/marcar-leidas | - | HTTP 200, todas las notificaciones del usuario actual actualizan leido=true | Integrante 2 |

### 8.08. Módulo 08: Dashboard y Métricas
Descripción: Validación de visualización de métricas, gráficos y filtros del dashboard

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-08-01-F | Tarjeta principal muestra total de incidencias | Frontend | 1. Ir a dashboard<br>2. Observar tarjeta superior | - | Tarjeta muestra: "Total de Incidencias: 150" (número actualizado) | Integrante 1 |
| CP-08-01-B | Endpoint retorna métricas generales agregadas | Backend | GET /api/metricas/generales | - | JSON: { "total": 150, "pendientes": 45, "en_proceso": 30, "resueltas": 75 } | Integrante 2 |
| CP-08-02-F | Gráfico de barras muestra incidencias por estado | Frontend | 1. Ver sección de gráficos en dashboard | - | Gráfico de barras/torta visible con colores diferenciados por estado, leyenda explicativa | Integrante 1 |
| CP-08-02-BD | Query SQL agrupa correctamente por estado | BD | Ejecutar query de métricas | SELECT estado_id, COUNT(*) FROM incidencias GROUP BY estado_id | Resultado coincide con datos del dashboard, sin errores | Integrante 3 |
| CP-08-03-F | Filtro por rango de fechas funciona | Frontend | 1. En dashboard, seleccionar fecha inicio: 01/06/2026<br>2. Seleccionar fecha fin: 08/06/2026<br>3. Click en "Aplicar" | Fecha inicio: 01/06/2026<br>Fecha fin: 08/06/2026 | Tarjetas y gráficos muestran únicamente datos del rango seleccionado | Integrante 1 |
| CP-08-03-B | Endpoint filtra por rango de fechas correctamente | Backend | GET /api/metricas/generales?inicio=2026-06-01&fin=2026-06-08 | - | JSON con métricas únicamente del rango especificado | Integrante 2 |
| CP-08-04-F | Filtro por tipo muestra datos correctos | Frontend | 1. Seleccionar filtro "Tipo: Infraestructura"<br>2. Aplicar | Tipo: Infraestructura | Dashboard muestra únicamente incidencias de tipo Infraestructura | Integrante 1 |
| CP-08-04-B | Query filtra por tipo_id correctamente | Backend | GET /api/metricas/generales?tipo_id=1 | - | Métricas filtradas por tipo_id = 1 | Integrante 2 |
| CP-08-05-F | Filtro por ubicación muestra datos correctos | Frontend | 1. Seleccionar país/provincia/ciudad en filtros<br>2. Aplicar | Ubicación: Argentina > Buenos Aires | Dashboard muestra únicamente incidencias de la ubicación seleccionada | Integrante 1 |
| CP-08-05-B | Query filtra por ubicación correctamente | Backend | GET /api/metricas/generales?ciudad_id=5 | - | Métricas filtradas por ciudad_id = 5 | Integrante 2 |
| CP-08-06-BD | Tiempo promedio de resolución calculado correctamente | BD | Query tiempo promedio de resolución | SELECT AVG(DATEDIFF(fecha_resolucion, created_at)) FROM incidencias WHERE estado_id = 3 AND fecha_resolucion IS NOT NULL | Valor numérico en días (ejemplo: 3.5 días promedio) | Integrante 3 |

### 8.09. Módulo 09: Autenticación y Control de acceso
Descripción: Validación de login, logout y protección de rutas

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-09-01-F | Login con credenciales válidas redirige a dashboard | Frontend | 1. Ingresar email: admin@ejemplo.com<br>2. Ingresar password: Admin123<br>3. Click en "Ingresar" | user: admin@ejemplo.com<br>pass: Admin123 | Spinner de carga, luego redirección a /dashboard, sin mensajes de error | Integrante 1 |
| CP-09-01-B | POST /login retorna token JWT o sesión | Backend | POST /api/login | { "email": "admin@ejemplo.com", "password": "Admin123" } | HTTP 200, respuesta incluye: { "token": "...", "user": { "id": 1, "nombre": "...", "rol": "admin" } } | Integrante 2 |
| CP-09-02-F | Login con password incorrecto muestra error | Frontend | 1. Credenciales correctas<br>2. Password: wrongpassword<br>3. Click "Ingresar" | pass: wrongpassword | Mensaje en pantalla: "Credenciales incorrectas. Verifique su email y contraseña." en color rojo | Integrante 1 |
| CP-09-02-B | Login falla con credenciales inválidas retorna 401 | Backend | POST /api/login con password incorrecto | - | HTTP 401, { "error": "Credenciales inválidas", "message": "Email o contraseña incorrectos" } | Integrante 2 |
| CP-09-03-F | Login con email vacío muestra validación | Frontend | 1. Dejar campo email vacío<br>2. Ingresar password<br>3. Click "Ingresar" | email: (vacío) | Mensaje debajo del campo: "El campo email es obligatorio" | Integrante 1 |
| CP-09-04-F | Logout cierra sesión y redirige a login | Frontend | 1. Click en "Cerrar sesión" del menú<br>2. Intentar acceder a /dashboard | - | Redirección a /login, sesión limpiada (token removido de localStorage) | Integrante 1 |
| CP-09-04-B | POST /logout invalida token en servidor | Backend | POST /api/logout con header Authorization | Header: Bearer {token} | HTTP 200, token agregado a blacklist o sesión invalidada | Integrante 2 |
| CP-09-05-F | Acceso sin autenticación redirige automáticamente a login | Frontend | 1. Abrir nueva pestaña<br>2. Ir directamente a /dashboard sin login | - | Redirección automática a /login, URL cambia | Integrante 1 |
| CP-09-06-F | Sesión expira y redirige a login | Frontend | 1. Esperar expiración de token (o manipular localStorage)<br>2. Intentar hacer una request | Token expirado | Mensaje "Sesión expirada. Por favor, inicie sesión nuevamente.", redirección a /login | Integrante 1 |

### 8.10. Modulo 10: Validaciones de formato y tipo de datos
Descripción: Validación de login, logout y protección de rutas

| ID | Descripción | Capa | Pasos de Prueba | Datos de Prueba | Resultado Esperado | Responsable |
| --- | --- | --- | --- | --- | --- | --- |
| CP-10-01-F | Email con formato inválido muestra error en tiempo real | Frontend | 1. Escribir "correo@" en campo email<br>2. Salir del campo (blur) | email: "correo@" | Mensaje de error aparece: "Ingrese un email válido (ejemplo: usuario@dominio.com)" | Integrante 1 |
| CP-10-01-B | Backend valida formato email con regex | Backend | POST /api/login con email sin dominio | "email": "correo@" | HTTP 422, "errors": {"email": ["El formato del email es inválido"]} | Integrante 2 |
| CP-10-02-F | Campo descripción muestra contador de caracteres | Frontend | 1. Ir a campo descripción de incidencia<br>2. Escribir texto<br>3. Observar contador | - | Contador visible: "0/500" que se actualiza al escribir, cambia a rojo al superar 450 caracteres | Integrante 1 |
| CP-10-03-F | Caracteres especiales HTML/XSS se sanitizan | Frontend | 1. Escribir en cualquier campo: <script>alert('hack')</script><br>2. Guardar<br>3. Ver valor almacenado | Input: <script>alert('hack')</script> | Texto se muestra como texto plano, no como HTML interpretado. Verificar en DevTools que no haya código inyectado | Integrante 1 |
| CP-10-03-B | Sanitización en backend previene XSS | Backend | Enviar payload con scripts en JSON | "descripcion": "<script>alert('xss')</script>" | HTTP 422 o texto almacenado sanitizado (caracteres HTML convertidos a entities) | Integrante 2 |
| CP-10-04-F | Campo numérico no acepta letras | Frontend | 1. Ir a campo prioridad (dropdown o número)<br>2. Intentar escribir letras | - | Solo valores numéricos o opciones válidas del dropdown son aceptadas | Integrante 1 |
| CP-10-05-F | Fecha inválida muestra mensaje de error | Frontend | 1. Ingresar fecha manualmente incorrecta<br>2. O seleccionar fecha imposible | fecha: "32/13/2026" | Mensaje de error: "Fecha inválida" | Integrante 1 |
| CP-10-06-B | Backend valida rango de fechas permitidas | Backend | Enviar fecha fuera de rango válido | "fecha_creacion": "2030-01-01" (si no está permitido) | HTTP 422 según reglas de negocio, o accepted si la lógica lo permite | Integrante 2 |

---

## 9. Resumen de Distribución de Pruebas

### 9.1. Conteo por Integrante y Capa

| Integrante | Casos Frontend (F) | Casos Backend (B) | Casos BD (BD) | Total Casos |
| :--- | :---: | :---: | :---: | :---: |
| **Integrante 1 (Frontend)** | 48 | 0 | 0 | 48 |
| **Integrante 2 (Backend)** | 0 | 36 | 0 | 36 |
| **Integrante 3 (Base de Datos)** | 0 | 0 | 6 | 6 |
| **Total General** | **48** | **36** | **6** | **90** |

### 9.2. Casos de Prueba por Módulo

| Módulo | Descripción | Total Casos |
| :--- | :--- | :---: |
| **01** | Gestión de Incidencias (CRUD) | 11 |
| **02** | Estados e Historial | 10 |
| **03** | Asignación de Responsables | 10 |
| **04** | Sistema de Comentarios | 9 |
| **05** | Ubicación Georreferenciada | 8 |
| **06** | Clasificación Jerárquica (Tipo/Subtipo) | 7 |
| **07** | Sistema de Notificaciones | 7 |
| **08** | Dashboard y Métricas | 11 |
| **09** | Autenticación y Control de Acceso | 9 |
| **10** | Validaciones de Formato y Tipo de Datos | 8 |

---

## 10. Plan de Ejecución de Pruebas

### 10.1. Cronograma Semanal

| Semana | Días | Actividades | Entregables |
| :--- | :--- | :--- | :--- |
| **Semana 1** | 1-2 | Configurar entorno de testing (Postman, herramientas) y definir matriz de CP completa. | Entorno listo, matriz CP v1.0. |
| **Semana 1** | 3-5 | Ejecución de pruebas del Módulo 01 (CRUD) y Módulo 02 (Estados). | Capturas de pantalla CP-01 y CP-02. |
| **Semana 2** | 1-3 | Ejecución de pruebas del Módulo 03 (Responsables) y Módulo 04 (Comentarios). | Capturas de pantalla CP-03 y CP-04. |
| **Semana 2** | 4-5 | Ejecución de pruebas del Módulo 05 (Ubicación) y Módulo 06 (Tipo/Subtipo). | Capturas de pantalla CP-05 y CP-06. |
| **Semana 3** | 1-3 | Ejecución de pruebas del Módulo 07 (Notificaciones) y Módulo 08 (Dashboard). | Capturas de pantalla CP-07 y CP-08. |
| **Semana 3** | 4-5 | Ejecución de pruebas del Módulo 09 (Auth) y Módulo 10 (Validaciones). | Capturas de pantalla CP-09 y CP-10. |
| **Semana 4** | 1-2 | Pruebas de carga y estrés con herramientas dedicadas (JMeter/k6). | Reporte técnico de carga. |
| **Semana 4** | 3-4 | Verificación de integridad de BD y formateo de código con Laravel Pint. | Reporte Laravel Pint e integridad BD. |
| **Semana 4** | 5 | Consolidación de evidencias técnicas y tabla de métricas finales. | Carpeta de evidencias organizada. |
| **Semana 5** | 1-2 | Revisión final y aplicación del checklist pre-sustentación. | Checklist completado. |
| **Semana 5** | 3-5 | Preparación final de la documentación técnica del proyecto. | Documento técnico de calidad final. |

### 10.2. Criterios de Progreso
* **Mínimo semanal:** Ejecutar al menos 15 casos de prueba con sus respectivas evidencias documentadas.
* **Punto de control (Checkpoint):** Reunión de equipo los viernes para revisar el progreso semanal y resolver bloqueos.
* **Dependencias:** Los módulos de análisis (08, 09) requieren que los módulos funcionales base (01, 02) estén aprobados y estables.

---

## 11. Plantilla de Registro de Ejecución de Casos de Prueba

### 11.1. Formato de Registro

| ID CP | Fecha Ejecución | Ejecutado Por | Módulo | Resultado | Severidad | Observaciones | Evidencia (Link/Captura) |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **CP-01-01-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-01-B** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-02-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-02-B** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-03-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-03-B** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-04-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-04-B** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-05-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-06-F** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-01-06-B** | --/06/2026 | | 01 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-01-F** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-01-B** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-02-F** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-02-B** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-03-F** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-03-B** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-04-F** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-05-F** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-05-B** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-02-06-BD** | --/06/2026 | | 02 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-01-F** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-01-B** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-02-F** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-02-B** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-03-F** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-03-B** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-04-F** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-04-B** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-05-F** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-03-05-B** | --/06/2026 | | 03 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-01-F** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-01-B** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-02-F** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-02-B** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-03-F** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-04-F** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-04-B** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-05-F** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-04-05-B** | --/06/2026 | | 04 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-01-F** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-01-B** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-02-F** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-02-B** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-03-F** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-03-B** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-04-F** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-05-04-BD** | --/06/2026 | | 05 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-01-F** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-01-B** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-02-F** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-02-B** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-03-F** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-03-B** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-06-04-BD** | --/06/2026 | | 06 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-01-F** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-02-F** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-02-B** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-03-F** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-04-BD** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-05-F** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-07-05-B** | --/06/2026 | | 07 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-01-F** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-01-B** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-02-F** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-02-BD** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-03-F** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-03-B** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-04-F** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-04-B** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-05-F** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-05-B** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-08-06-BD** | --/06/2026 | | 08 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-01-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-01-B** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-02-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-02-B** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-03-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-04-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-04-B** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-05-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-09-06-F** | --/06/2026 | | 09 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-01-F** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-01-B** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-02-F** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-03-F** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-03-B** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-04-F** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-05-F** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |
| **CP-10-06-B** | --/06/2026 | | 10 | ☐ Aprobado ☐ Fallido | | | |

### 11.2. Leyenda de Severidad (para casos fallidos)

| Nivel | Descripción | Acción Requerida |
| :--- | :--- | :--- |
| **Crítica** | Bloquea el uso de una funcionalidad principal sin alternativa viable. | Corrección inmediata. Detiene el despliegue del módulo. |
| **Alta** | Afecta un flujo de trabajo importante del sistema, pero hay alternativa temporal. | Corrección en un plazo máximo de 24 horas. |
| **Media** | Afecta una funcionalidad secundaria o genera un comportamiento visual incorrecto. | Corrección planificada antes de la entrega final. |
| **Baja** | Detalles cosméticos, mejoras de usabilidad o inconsistencias menores. | Se corrige sujeto a disponibilidad de tiempo. |

---

## 12. Estructura de Carpeta de Evidencias

```directory
evidencias/
├── 01_gestion_incidencias/
│   ├── CP-01-01-F_formulario_completo.png
│   ├── CP-01-01-B_postman_201.png
│   ├── CP-01-02-F_validacion_titulo_vacio.png
│   ├── CP-01-02-B_postman_422.png
│   ├── CP-01-03-F_input_telefono.png
│   └── ...
├── 02_estados_historial/
│   ├── CP-02-01-F_dropdown_estados.png
│   ├── CP-02-02-F_cambio_estado.png
│   └── ...
├── 03_responsables/
├── 04_comentarios/
├── 05_ubicacion/
├── 06_tipos_subtipos/
├── 07_notificaciones/
├── 08_dashboard/
│   ├── dashboard_metrics.png
│   └── grafico_estados.png
├── 09_autenticacion/
│   ├── login_exitoso.png
│   ├── login_fallido.png
│   └── logout.png
├── 10_validaciones_formato/
├── herramientas/
│   ├── postman_coleccion_completa.json
│   ├── laravel_pint_resultado.html
│   └── jmeter_reporte.html
└── metricas/
    ├── tabla_metricas_finales.xlsx
    └── resumen_ejecucion.pdf
```

---

## 13. Criterios de Cierre del Plan de Calidad

El plan de calidad se considera completado y aprobado cuando se cumplan los siguientes criterios:

| # | Criterio | Indicador de Éxito | Estado |
| :---: | :--- | :--- | :---: |
| **1** | 100% de casos de prueba ejecutados | Total ejecutados = Total planificados (90) | ☐ |
| **2** | 100% de casos aprobados | Casos aprobados / Total ejecutados = 100% | ☐ |
| **3** | Validaciones frontend verificadas | Todos los casos `CP-XX-F` aprobados | ☐ |
| **4** | Validaciones backend verificadas | Todos los casos `CP-XX-B` aprobados | ☐ |
| **5** | Integridad de BD verificada | Todos los casos `CP-XX-BD` aprobados | ☐ |
| **6** | Pruebas de carga ejecutadas | Reporte técnico de JMeter / k6 generado sin errores | ☐ |
| **7** | Uso demostrado de herramientas | Evidencia gráfica de Postman, Laravel Pint y JMeter | ☐ |
| **8** | Carpeta de evidencias completa | Capturas guardadas y organizadas bajo estructura estándar | ☐ |
| **9** | Tabla de métricas consolidada | Valores reales documentados y comparados con objetivo | ☐ |
| **10** | Ausencia de errores de consola | Cero errores JavaScript no controlados (`Uncaught`) | ☐ |

---

## 14. Checklist Pre-Sustentación

| # | Ítem | Descripción | Responsable | Estado |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Documento técnico de sustentación | Estructura de 8-12 páginas, con evidencias e interpretaciones. | Todos | ☐ |
| **2** | Carpeta de evidencias organizada | Estructura del repositorio al día con todas las capturas de pantalla. | Todos | ☐ |
| **3** | Matriz de casos de prueba completada | Registro de ejecución con fecha, responsable y resultado (100%). | Todos | ☐ |
| **4** | Capturas de validaciones de entrada | Evidencia gráfica de formularios UI y payloads Postman. | Integrantes 1 y 2 | ☐ |
| **5** | Reporte de Laravel Pint | Captura de ejecución limpia en consola asegurando PSR-12. | Integrante 2 | ☐ |
| **6** | Reporte de JMeter / k6 | Gráficos de concurrencia y latencia anexados al documento. | Integrante 3 | ☐ |
| **7** | Credenciales de acceso de prueba | Cuenta de administrador y cuenta de usuario común configuradas. | Todos | ☐ |
| **8** | URL del sistema en producción | Sistema accesible en entorno de despliegue controlado. | Integrante 3 | ☐ |
| **9** | Archivo SQL de respaldo | Base de datos limpia con datos de prueba cargados (seeders). | Integrante 3 | ☐ |
| **10** | Repositorio de código fuente | GitHub actualizado con el tag de la versión final de entrega. | Todos | ☐ |

---

## 15. Métricas e Indicadores del Sistema

Las siguientes métricas e indicadores de rendimiento y calidad se medirán y consolidarán al cierre del proyecto integrador *(cubre O6)*:

| Métrica | Descripción | Valor Objetivo | Herramienta de Medición | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **Tasa de validación backend** | % de endpoints protegidos por Form Requests de Laravel. | 100% | Inspección de código / Postman | ☐ |
| **Tasa de éxito de casos de prueba** | % de casos funcionales del sistema aprobados. | 100% | Matriz de casos de prueba | ☐ |
| **Tiempo promedio de respuesta** | Latencia promedio del servidor bajo carga concurrente simulada. | < 2.0 segundos | JMeter / k6 | ☐ |
| **Errores JS no controlados** | Cantidad de `Uncaught Errors` en la consola del navegador. | 0 | DevTools (Consola) | ☐ |
| **Cobertura de evidencias** | % de casos de prueba ejecutados que tienen captura o reporte. | 100% | Revisión de carpeta de evidencias | ☐ |
| **Tiempo promedio de resolución** | Tiempo promedio entre la creación de una incidencia y su cambio al estado "Resuelto". | Referencial (línea base) | Consulta SQL / Dashboard | ☐ |

---

## 16. Riesgos de Calidad y Acciones Mitigadoras

| Riesgo Técnico | Impacto | Probabilidad | Acción Preventiva (QA) | Acción Correctiva (QC) |
| :--- | :--- | :--- | :--- | :--- |
| **Pérdida de datos en contenedores** | Crítico | Baja | Configurar volúmenes locales (`volumes:`) para el motor SQL en `docker-compose.yml`. | Copias de seguridad manuales de la base de datos antes de reiniciar contenedores. |
| **Bloqueo por CORS** | Alto | Media | Configurar correctamente el middleware de CORS de Laravel, definiendo la whitelist de dominios del frontend. | Revisar configuraciones en `config/cors.php` si Fetch falla. |
| **Inyección de datos corruptos o redundancia en ubicación** | Crítico | Baja | Aplicar normalización 3FN con tablas separadas (País, Provincia, Ciudad). Implementar reglas estrictas en Laravel Form Requests (`required`, `integer`, `exists:ciudades,id`). | Limpiar la BD, restaurar desde seeders y volver a validar endpoints en Postman. |
| **Evidencias incompletas** | Alto | Media | Establecer como política obligatoria documentar y capturar cada caso en el momento de su ejecución. | Sesión de testing conjunta dedicada exclusivamente a consolidar capturas antes de la entrega final. |
| **Sesión expira durante pruebas** | Medio | Media | Configurar tiempo de expiración adecuado del token de sesión (JWT) y manejo de refresco en frontend. | Regenerar token y re-ejecutar el lote de pruebas correspondiente. |

---

## 17. Herramientas de Calidad

| Categoría | Herramienta | Propósito / Actividad | Objetivo Cubierto |
| :--- | :--- | :--- | :---: |
| **Calidad de Código** | Laravel Pint | Verificación automática del cumplimiento del estándar PSR-12 en el código PHP. | O5 |
| **Pruebas de API** | Postman | Validación y depuración de endpoints REST, códigos HTTP y payloads JSON. | O1, O3, O5 |
| **Pruebas de Carga** | Apache JMeter / k6 | Simulación de carga concurrente y estrés sobre los endpoints críticos del sistema. | O4, O5 |
| **Inspección de UI** | Chrome DevTools | Auditoría de responsividad visual, rendimiento de red y depuración de consola de JavaScript. | O1, O3 |
| **Orquestación** | Docker Compose | Despliegue, aislamiento de servicios y validación de persistencia del entorno controlado. | O4 |
| **Control de Versiones** | Git / GitHub | Control de versiones distribuido, flujo de ramas Git Flow y revisiones de código de pares. | O5 |

---

## 18. Seguimiento y Mejora Continua

* **Puntos de Control:** Revisiones internas periódicas de los contenedores Docker y los endpoints de la API REST previas a la sustentación técnica final. En cada sesión se verificará el cumplimiento de los criterios de aceptación y los estados de los casos de prueba.
* **Bitácora de Control de Errores (QC):** Toda falla funcional detectada durante la ejecución del plan de pruebas se registrará internamente. El componente afectado se devolverá al equipo de desarrollo para su corrección inmediata y requerirá una nueva ronda de pruebas (re-test) antes de declararse aprobado.
* **Criterio de Cierre del Plan:** El plan de gestión de calidad se dará por cerrado exitosamente cuando el 100% de los indicadores de la matriz técnica (§13) alcancen el umbral definido, las evidencias estén almacenadas organizadamente (§12) y el checklist de pre-sustentación (§14) esté verificado al 100%.