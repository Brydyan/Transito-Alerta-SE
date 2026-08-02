## 🟢 PASO 1: Connection Pooling (Integrante 3 — 30 min)

### Opción RÁPIDA (recomendada ahora):
```bash
# 1. Conectar a PostgreSQL
docker compose exec db psql -U user -d incidencias_db

# 2. Aumentar conexiones
ALTER SYSTEM SET max_connections = 250;
SELECT pg_reload_conf();

# 3. Verificar
SELECT setting FROM pg_settings WHERE name = 'max_connections';
```

**Esperar resultado:**
```
setting
---------
250
```

✅ **LISTO.** Próximo paso.
