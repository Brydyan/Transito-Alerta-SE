# 3: Esquema de Base de Datos y Auditoría de Migración

## Migración GeoReporta → Transito-Alerta-SE

Las 72 migraciones de GeoReporta deben auditarse, categorizarse por complejidad de portación, y ser reutilizadas o reescritas como SQL para NestJS/Postgres/PostGIS.

### Estado de Auditoría de Migración

**Aplicadas a Transito-Alerta-SE** (0001-0010):
- ✅ 0001: users, organizations (esquema base)
- ✅ 0002-0003: Extensión PostGIS, geo_zones (geofencing)
- ✅ 0004: incidents (dominio principal)
- ✅ 0005: comments (comentarios anidados)
- ✅ 0006: perfil de users (avatares, perfil)
- ✅ 0007: assignments (detección de conflictos)
- ✅ 0008: anonymous_read_comments (seed RBAC)
- ⏳ 0009: roles_permissions (T3.1 recién commiteada)
- ⏳ 0010: user_email (T3.5 recién commiteada)

**Auditoría Pendiente & Portación** (0011-0016 de Fase 3):
- 0011: incident_categories (T3.7)
- 0012: invitations (T3.6)
- 0013: status_history (T3.4)
- 0014: locations / geo_zones_triggers (T3.8)
- 0015: sessions (T3.9)
- 0016: configuración mail (T3.5 — mayormente env vars, sin esquema)

### Estrategia de Portación en Bloque

**Auditoría de Muestra** (10% de 72 migraciones de GeoReporta):
1. Leer primeras 7 migraciones (fundación del esquema)
2. Verificar características no portables (migraciones Eloquent, tablas específicas de queue)
3. Extraer patrón SQL (nombre de tabla, columnas, índices, restricciones)
4. Mapear a convenciones de nombres NestJS TypeORM (tablas/columnas snake_case, timestamps explícitos)

**Extrapolación** (verificación spot de 5 migraciones aleatorias de rango medio):
- Verificar que patrones se mantengan en muestras aleatorias
- Marcar excepciones (ej: triggers personalizados, stored procedures)

**Mapeo Final**:
- 72 migraciones GeoReporta → ~20 migraciones NestJS (consolidación por dominio de entidad)
- Esquema Transito es más pequeño (menos tablas de auditoría, enfoque de pista de auditoría más simple via StatusHistory + Sessions)

### Gotchas Clave

**Específicos de Supabase**:
1. **Extensión PostGIS**: No habilitada por defecto
   - Usuario debe ejecutar manualmente: `CREATE EXTENSION postgis; SELECT postgis_version();` en editor SQL de Supabase
   - Verificar disponibilidad de índice GIST (requerido para geofencing `ST_Contains`)
   - Nota: PostGIS 3.4 disponible en Supabase PostgreSQL 16 ✅

2. **Connection Pooling**:
   - Supabase administrada usa pgBouncer para connection pooling (20 conexiones por rol por defecto)
   - Si backend NestJS escala a 5+ instancias, cada una manteniendo 5 conexiones → 25 total → puede necesitar pool más alto
   - Solución: Usar config de pool de conexión en .env o solicitar upgrade de tier de Supabase

3. **Cascadas de Foreign Key**:
   - Supabase enforce FK constraints estrictamente
   - Todas las migraciones deben incluir comportamiento `ON DELETE` apropiado (CASCADE / RESTRICT / SET NULL)
   - Probar cascadas en dev antes de prod

### Ejecutor Manual de Migraciones

**Script**: `backend/scripts/run-migrations.ts` (Testcontainers + ejecutor manual)
- Lee todos los archivos `.sql` de `database/migrations/` en orden (0001, 0002, ...)
- Aplica cada migración si no ya aplicada (rastreado en tabla `schema_migrations`)
- En error: rollback y salida (modo estricto)
- Rollback via archivos DOWN en orden inverso

**Uso**:
```bash
# Dev local (contra Postgres en Docker)
pnpm run db:migrate

# Prod Supabase (via dashboard SQL editor)
-- Copy-paste contenidos de database/migrations/0009_roles_permissions.sql
-- Ejecutar, verificar éxito, luego 0010_user_email.sql
```

### Estrategia de Cutover

**1. Validación Pre-Cutover** (Semana antes del launch):
- [ ] Ejecutar todas las migraciones 0001-0016 contra BD staging de Supabase
- [ ] Verificar esquema coincide con definiciones de entidad NestJS (sin columnas faltantes, tipos incorrectos)
- [ ] Probar integridad referencial (restricciones FK enforzadas)
- [ ] Verificar disponibilidad de funciones PostGIS (`ST_Contains`, `ST_DWithin`, `ST_Distance`)

**2. Período Dual-Write** (Opcional, 1 semana):
- Laravel aún escribe en BD compartida
- NestJS también escribe en BD compartida
- Monitorear conflictos (raros si separación FK mantenida)

**3. Ventana de Cutover** (30 min de ventana de mantenimiento):
- [ ] Detener API Laravel (notificar usuarios, mostrar página de mantenimiento)
- [ ] Ejecutar scripts de migración de datos finales (ej: backfill emails de usuarios del sistema antiguo)
- [ ] Detener API NestJS (si ya ejecutándose en paralelo)
- [ ] Aplicar migraciones pendientes (0009-0010 si no ya hechas)
- [ ] Verificar integridad del esquema (`SELECT COUNT(*) FROM schema_migrations;` debe coincidir con lo esperado)
- [ ] Boot API NestJS + ejecutar health checks
- [ ] Monitorear tasas de error durante 1 hora (objetivo: sin nuevos errores 5xx)
- [ ] Procedimiento de rollback: restaurar desde backup (point-in-time restore de Supabase), reiniciar Laravel

**4. Monitoreo Post-Cutover** (48 horas):
- [ ] Registrar todos los errores de BD (violaciones FK, fallas de restricción)
- [ ] Monitorear tiempos de respuesta API (baseline de load test)
- [ ] Vigilar deletes en cascada (registrar cualquier remoción inesperada de fila)

### Criterios de Éxito

- [ ] Todas las migraciones 0001-0016 se aplican limpialmente a staging de Supabase
- [ ] Cero violaciones de restricción FK en primeras 24 horas post-cutover
- [ ] Esquema validado: app NestJS bootea exitosamente con esquema real
- [ ] Backup probado: restaurar desde snapshot, verificar integridad de datos
