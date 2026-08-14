# Tasks

- [x] T1 — Crear el directorio `backend/api/storage/app/backups/` y su respectivo `.gitignore` para omitir los `*.sql`. Cubre: R4.
- [x] T2 — Generar la clase del comando con `php artisan make:command DatabaseDump` y configurar la firma a `db:dump`. Cubre: R1.
- [x] T3 — Implementar la lógica con `Symfony\Component\Process\Process` para probar si existe el contenedor `sistema_postgres` y ejecutar el dump mediante `docker exec`. Cubre: R2.
- [x] T4 — Añadir la lógica de respaldo (fallback) en el comando para que use `pg_dump` local en caso de que Docker no esté disponible. Cubre: R3.
- [x] T5 — Añadir el manejo de errores global (try/catch o validación de exit code) para mostrar un mensaje rojo en consola (`$this->error()`) y retornar `Command::FAILURE`. Cubre: R5.
- [x] T6 — Escribir un test en `tests/Feature/DatabaseDumpCommandTest.php` comprobando que el comando pueda invocarse e interactuar correctamente con el output (mockeando el proceso o ejecutándolo según el entorno de prueba). Cubre: R1, R2, R3, R4, R5.
