## 🟠 PASO 4: Redis Cache TTL (Integrante 2 — 15 min)

### 4a. Buscar todas las `Cache::put()` sin TTL
```bash
grep -rn "Cache::put" backend/app/Domains/Incidents --include="*.php"
```

**Ejemplo resultado:**
```
backend/app/Domains/Incidents/Listeners/RedisIncidentSync.php:125: Cache::put($feedKey, $feedData);
```

### 4b. Editar cada una
```php
// ❌ ANTES:
Cache::put($feedKey, $feedData);

// ✅ DESPUÉS:
Cache::put($feedKey, $feedData, 3600);  // 1 hora TTL
```

O más explícito:
```php
Redis::setex($feedKey, 3600, json_encode($feedData));
```

### 4c. Reiniciar backend (para recargar código)
```bash
docker compose restart backend
```

✅ **LISTO.** Próximo paso.
