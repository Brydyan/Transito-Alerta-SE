# Guía de Migraciones y Modelos en Laravel (Prisma vs. Eloquent)

Si venís del ecosistema de Node con **Prisma ORM**, estás acostumbrado a un enfoque **Schema-First**:
1. Escribís todo el modelo de datos en el archivo `schema.prisma`.
2. Prisma se encarga de crear las migraciones SQL y generar los clientes de TypeScript de forma automática.

**En Laravel (con Eloquent ORM), el paradigma es totalmente distinto.** Laravel usa un enfoque **Migration-First**. La definición de la base de datos y la lógica del modelo están separadas en dos lugares distintos.

---

## 1. La Regla de Oro en Laravel

> [!IMPORTANT]
> **Los modelos en Laravel no definen las columnas de la base de datos.**
>
> A diferencia de Prisma, el archivo del modelo (ej: `app/Models/Incidencia.php`) está casi vacío de propiedades. Eloquent ORM inspecciona la base de datos en tiempo de ejecución para saber qué columnas existen.
>
> * **¿Querés cambiar la estructura de la base de datos?** Tenés que crear o modificar una **Migración**.
> * **¿Querés definir lógica, relaciones o seguridad de escritura?** Modificás el **Modelo**.

---

## 2. Tabla de Comparación: ¿Dónde modifico qué?

| Acción | ¿Cómo se hace en Prisma? | ¿Cómo se hace en Laravel (Eloquent)? |
| :--- | :--- | :--- |
| **Crear una nueva tabla** | Agregás un bloque `model` en `schema.prisma` y corrés `prisma migrate`. | Creás un archivo de migración con `make:migration` y definís las columnas en PHP. |
| **Agregar una columna a una tabla** | Modificás el modelo dentro de `schema.prisma` y corrés `prisma migrate`. | Generás una migración de alteración (ej: `add_columna_to_tabla_table`) y la ejecutás. |
| **Definir relaciones (1-to-N)** | Declarás relaciones con atributos `@relation` en `schema.prisma`. | Escribís un método en el archivo del **Modelo** usando `$this->belongsTo()` o `$this->hasMany()`. |
| **Validar qué campos se pueden escribir** | Prisma expone todos los campos del esquema por defecto. | Declarás el array `$fillable` en el **Modelo** para evitar asignaciones masivas maliciosas (Mass Assignment). |

---

## 3. Ejemplo Práctico: Agregar el campo `prioridad` a la tabla `incidencias`

Imaginemos que ya tenemos la tabla `incidencias` y queremos agregarle una columna llamada `prioridad` (que puede ser 'alta', 'media', 'baja').

### Paso 1: Crear el archivo de migración
Ejecutá el comando para generar una migración específica de alteración de tabla:
* **Local:** `php artisan make:migration add_prioridad_to_incidencias_table --table=incidencias`
* **Docker:** `docker compose exec backend php artisan make:migration add_prioridad_to_incidencias_table --table=incidencias`

Esto crea un archivo en `backend/database/migrations/YYYY_MM_DD_HHMMSS_add_prioridad_to_incidencias_table.php`.

### Paso 2: Definir la columna en PHP
Abrí el archivo de migración generado y completá los métodos `up` (lo que se aplica) y `down` (cómo se deshace):

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidencias', function (Blueprint $table) {
            // Agregamos la columna 'prioridad'
            $table->string('prioridad')->default('media')->after('descripcion'); 
        });
    }

    public function down(): void
    {
        Schema::table('incidencias', function (Blueprint $table) {
            // Revertimos el cambio eliminando la columna
            $table->dropColumn('prioridad');
        });
    }
};
```

### Paso 3: Correr la migración
Impactá el cambio en la base de datos real:
* **Local:** `php artisan migrate`
* **Docker:** `docker compose exec backend php artisan migrate`

### Paso 4: Habilitar el campo en el Modelo
Para que Laravel te permita guardar datos en esa nueva columna usando asignación masiva (por ejemplo, al recibir datos de la API), debés agregar la columna al array `$fillable` del modelo `app/Models/Incidencia.php`:

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Incidencia extends Model
{
    // Definimos qué campos se pueden escribir de forma masiva
    protected $fillable = [
        'titulo',
        'descripcion',
        'ubicacion',
        'prioridad', // <-- Agregamos el nuevo campo acá
    ];

    // Las relaciones se definen como métodos:
    public function comentarios()
    {
        return $this->hasMany(Comentario::class);
    }
}
```

---

## Resumen del Flujo de Trabajo en Laravel

```text
[Modificar Base de Datos]
         │
         ▼
Crear archivo de Migración (make:migration)
         │
         ▼
Definir columnas usando PHP Schema Builder
         │
         ▼
Correr migración para alterar DB (migrate)
         │
         ▼
[Opcional] Agregar campos al $fillable en el Modelo
```
