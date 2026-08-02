# Guía de Comandos de Laravel (Artisan)

Esta guía contiene los comandos de Laravel Artisan indispensables para el desarrollo del proyecto, detallando la sintaxis tanto para entornos de ejecución **local directa** como para entornos **contenedorizados con Docker**.

---

## Modos de Ejecución

Según cómo tengas configurado tu entorno de desarrollo, deberás elegir una de las siguientes variantes para ejecutar cada comando:

### 1. Ejecución Local (Estándar)
Si tenés instalado PHP y Composer directamente en tu máquina local y configuraste la base de datos de forma local:
```bash
php artisan <comando>
```

### 2. Ejecución con Docker Compose (Recomendado)
Si estás corriendo todo el stack a través de Docker y querés ejecutar el comando desde la raíz del proyecto sin entrar al contenedor:
```bash
docker compose exec backend php artisan <comando>
```

### 3. Ejecución con Docker CLI Directo
Si preferís usar el comando estándar de Docker con el contenedor activo:
```bash
docker exec -it <nombre_contenedor_backend> php artisan <comando>
```

---

## 1. Migraciones y Base de Datos (Estructura)

### Crear una Nueva Migración
* **Local:**
  ```bash
  php artisan make:migration create_nombre_de_tabla_table
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan make:migration create_nombre_de_tabla_table
  ```
* *Ubicación del archivo creado:* `backend/database/migrations/`

### Aplicar las Migraciones Pendientes
* **Local:**
  ```bash
  php artisan migrate
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan migrate
  ```

### Ver el Estado de las Migraciones
* **Local:**
  ```bash
  php artisan migrate:status
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan migrate:status
  ```

### Deshacer la Última Migración (Rollback)
* **Local:**
  ```bash
  php artisan migrate:rollback
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan migrate:rollback
  ```

### Resetear la Base de Datos desde Cero
> [!WARNING]
> Este comando elimina todas las tablas y vuelve a ejecutar todas las migraciones desde el principio. **Se perderán todos los datos cargados**.

* **Local:**
  ```bash
  php artisan migrate:fresh --seed
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan migrate:fresh --seed
  ```
*(La bandera `--seed` es opcional; se usa para volver a poblar la base de datos con datos iniciales).*

---

## 2. Generación de Componentes (Modelos, Controladores y más)

### Crear un Modelo
* **Local:** `php artisan make:model NombreModelo`
* **Docker:** `docker compose exec backend php artisan make:model NombreModelo`

### Crear un Controlador (API)
* **Local:** `php artisan make:controller API/IncidenciaController --api`
* **Docker:** `docker compose exec backend php artisan make:controller API/IncidenciaController --api`

### Crear un Request (Validación)
* **Local:** `php artisan make:request StoreIncidenciaRequest`
* **Docker:** `docker compose exec backend php artisan make:request StoreIncidenciaRequest`

### Crear Seeders (Datos de Prueba iniciales)
* **Local:** `php artisan make:seeder CategoriaSeeder`
* **Docker:** `docker compose exec backend php artisan make:seeder CategoriaSeeder`

> [!TIP]
> **Crear Modelo, Migración, Controlador y Factory a la vez:**
> * **Local:** `php artisan make:model Incidencia -mcf --api`
> * **Docker:** `docker compose exec backend php artisan make:model Incidencia -mcf --api`

---

## 3. Caché y Configuración

Útiles para cuando modificás el archivo `.env` o agregás nuevas rutas y no se ven reflejadas.

### Limpiar Toda la Caché (General)
* **Local:** `php artisan optimize:clear`
* **Docker:** `docker compose exec backend php artisan optimize:clear`

### Limpiar Cachés Específicas
* **Caché del archivo `.env`:**
  * **Local:** `php artisan config:clear`
  * **Docker:** `docker compose exec backend php artisan config:clear`
* **Caché de Rutas:**
  * **Local:** `php artisan route:clear`
  * **Docker:** `docker compose exec backend php artisan route:clear`

---

## 4. Colas de Trabajo (Queue Workers)

Para procesar tareas asincrónicas en segundo plano administradas por Redis.

### Iniciar el Worker de Colas
* **Local:**
  ```bash
  php artisan queue:work
  ```
* **Docker:**
  ```bash
  docker compose exec backend php artisan queue:work
  ```

---

## 5. Utilidades

### Consola Interactiva (Tinker)
* **Local:** `php artisan tinker`
* **Docker:** `docker compose exec backend php artisan tinker`

### Ver Rutas Registradas
* **Local:** `php artisan route:list`
* **Docker:** `docker compose exec backend php artisan route:list`
