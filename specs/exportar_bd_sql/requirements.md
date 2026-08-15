# Requirements

## R1
CUANDO el administrador o desarrollador ejecuta el comando de consola `php artisan db:dump`, el sistema DEBE generar un archivo de volcado SQL completo (incluyendo esquema y datos) de la base de datos `gestion_incidencias`.

## R2
MIENTRAS el sistema genera el volcado, el sistema DEBE priorizar interactuar con el contenedor de base de datos definido como `sistema_postgres` (utilizando el binario `docker` desde la máquina host mediante procesos del sistema).

## R3
SI el contenedor `sistema_postgres` no está disponible o Docker no está instalado en la máquina, ENTONCES el sistema DEBE intentar realizar el volcado utilizando una instalación local nativa de `pg_dump` apuntando a la base de datos local (ej. `localhost`).

## R4
CUANDO el proceso de volcado finaliza exitosamente, el sistema DEBE almacenar el archivo `.sql` resultante de forma segura en el directorio `storage/app/backups/`.

## R5
SI ni el contenedor está disponible ni la herramienta `pg_dump` está instalada localmente, o si la conexión a la base de datos falla, ENTONCES el sistema DEBE mostrar un mensaje de error explicativo por consola y finalizar la ejecución con un código de salida distinto de cero (ej. `Command::FAILURE`).
