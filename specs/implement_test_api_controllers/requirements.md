# Requirements para implement_test_api_controllers

## R1
El sistema DEBE contar con pruebas de integración o unitarias para todos los controladores del backend que tengan una longitud máxima de 150 líneas.

## R2
MIENTRAS se ejecutan las pruebas, el sistema DEBE utilizar la base de datos PostgreSQL en lugar de SQLite para garantizar la compatibilidad con consultas espaciales (PostGIS) y esquemas custom.

## R3
CUANDO se ejecutan las pruebas, el sistema DEBE usar RefreshDatabase o estrategias equivalentes para limpiar y preparar los datos de prueba sin afectar otras ejecuciones.

## R4
El sistema DEBE probar cada uno de los métodos públicos de los controladores seleccionados, validando que el código de estado HTTP sea el correcto (ej. 200 OK, 201 Created, 422 Unprocessable Entity).

## R5
SI un método del controlador recibe datos inválidos, ENTONCES el sistema DEBE verificar que se devuelvan los errores de validación y excepciones correspondientes.

## R6
SI ocurre una excepción o error durante el procesamiento de la petición, ENTONCES el sistema DEBE verificar que la respuesta HTTP maneje adecuadamente dicho error (ej. 500, 403, 404).
