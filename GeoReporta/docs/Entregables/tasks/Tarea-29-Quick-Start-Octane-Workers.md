## 🟢 PASO 2: Octane Workers (Integrante 2 — 10 min)

### 1. Editar docker-compose.yml
```bash
nano docker-compose.yml
```

Buscar sección `backend` → línea `command:`, cambiar:
```yaml
# ❌ ANTES:
command: php artisan octane:start --workers=2 --port=8000 --host=0.0.0.0

# ✅ DESPUÉS:
command: php artisan octane:start --workers=4 --port=8000 --host=0.0.0.0
```

Guardar: `Ctrl+X` → `Y` → `Enter`

### 2. Reiniciar backend
```bash
docker compose down backend
docker compose up -d backend
```

### 3. Verificar workers activos
```bash
docker compose exec backend ps aux | grep octane
```

**Esperar resultado (debería mostrar 4+ líneas):**
```
root  12345  0.1  0.2  ... octane:worker 0
root  12346  0.1  0.2  ... octane:worker 1
root  12347  0.1  0.2  ... octane:worker 2
root  12348  0.1  0.2  ... octane:worker 3
root  12349  0.2  0.3  ... octane:server
```

✅ **LISTO.** Próximo paso.
