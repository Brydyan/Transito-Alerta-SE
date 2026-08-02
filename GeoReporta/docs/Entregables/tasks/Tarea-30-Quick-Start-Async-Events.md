## 🟠 PASO 3: Async Events (Integrante 2 — 45 min)

### 3a. Verificar Redis configurado
```bash
grep QUEUE_CONNECTION backend/.env
```

**Esperar resultado:**
```
QUEUE_CONNECTION=redis
```

Si no está, agregarlo:
```bash
echo "QUEUE_CONNECTION=redis" >> backend/.env
```

### 3b. Marcar listeners como queueable
```bash
# Ir a directorio listeners
cd backend/app/Domains/Incidents/Listeners
```

Editar **cada listener file** que sincroniza datos:

#### RedisIncidentSync.php
```php
<?php
namespace App\Domains\Incidents\Listeners;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class RedisIncidentSync implements ShouldQueue  // ← AGREGAR
{
    use InteractsWithQueue;  // ← AGREGAR
    
    public function handle($event)
    {
        // existing code...
    }
}
```

#### StatusHistoryRecorder.php (si existe)
```php
// Igual: agregar `implements ShouldQueue` y `use InteractsWithQueue`
```

### 3c. Iniciar queue worker
```bash
docker compose exec -d backend php artisan queue:work redis --tries=3 --timeout=90
```

Verificar está corriendo:
```bash
docker compose exec backend ps aux | grep queue:work
```

**Esperar resultado:**
```
root  12380  0.1  0.3  ... php artisan queue:work
```

✅ **LISTO.** Próximo paso.
