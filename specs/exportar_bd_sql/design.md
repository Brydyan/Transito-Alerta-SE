# Design

## Archivos a crear / modificar
- `backend/api/app/Console/Commands/DatabaseDump.php`: Nuevo comando de Artisan que actuará como la herramienta principal de volcado automatizado multiplataforma.
- `backend/api/storage/app/backups/.gitignore`: Archivo para garantizar que el directorio exista en el repositorio pero ignore los volcados `.sql` generados localmente.
- `backend/api/tests/Feature/DatabaseDumpCommandTest.php`: Pruebas automatizadas del comando de consola.

## Detalles técnicos y Firmas
- El comando `DatabaseDump` (firma: `db:dump`) utilizará la clase `Symfony\Component\Process\Process` para ejecutar procesos a nivel del sistema operativo desde PHP, logrando compatibilidad con Windows, Linux y Mac.
- El comando evaluará el entorno:
  1. Intentará ejecutar `docker ps -q -f name=sistema_postgres`. Si el contenedor existe y está en ejecución, ejecutará `docker exec -t sistema_postgres pg_dump ...`.
  2. Si el paso 1 falla, verificará la disponibilidad de `pg_dump` local y ejecutará el comando apuntando a `localhost`.
- El archivo generado tendrá un nombre basado en la fecha y hora, guardándose con el `Storage` facade de Laravel o directamente en `storage_path('app/backups/')`.

## Excepciones
- Si `Process` determina que ni Docker ni `pg_dump` local están disponibles (o fallan), se capturará el error, se imprimirá mediante `$this->error()` en la consola, y se retornará `Command::FAILURE` (código `1`).

## Alternativa descartada
- **Script de Bash (`export_db.sh`):** Se descartó porque, aunque es ideal para Linux/Mac, en Windows no funciona nativamente a menos que el usuario tenga Git Bash o WSL instalados. El comando Artisan resuelve la fricción multiplataforma ya que todo desarrollador de Laravel tiene garantizada la ejecución de scripts PHP.
