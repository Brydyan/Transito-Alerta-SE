# Requirements: Refactor Relación Incidencia-Institución a N:M (Apoyo)

## R1
El sistema DEBE mantener la institución principal asignada por defecto (columna `institucion_id`) y DEBE permitir asociar opcionalmente múltiples instituciones secundarias de apoyo utilizando una tabla pivote dedicada.

## R2
CUANDO un usuario (Administrador, Supervisor o Ciudadano) registra una incidencia, el sistema DEBE permitir incluir opcionalmente un listado de instituciones de apoyo.

## R3
DONDE el usuario sea un Ciudadano registrando una incidencia, el sistema (frontend) DEBE proveer un modal o pantalla específica para que pueda elegir libremente las instituciones de apoyo que desee solicitar.

## R4
MIENTRAS una incidencia está en proceso (pantalla de detalle), el sistema DEBE permitir a los Administradores y Supervisores asignar o modificar las instituciones de apoyo (ej. desde el hilo de comentarios o controles de la vista).

## R5
CUANDO un usuario con rol 'Institucion' intenta leer un listado (index), acceder al detalle, modificar o comentar una incidencia, el sistema DEBE conceder el acceso si la institución del usuario coincide con la institución principal (dueña) O si figura dentro de las instituciones de apoyo de dicha incidencia.
