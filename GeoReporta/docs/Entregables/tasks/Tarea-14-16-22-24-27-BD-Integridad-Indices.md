# 🟣 TAREAS BD/INFRAESTRUCTURA — Integrante 3
**Especialista: Base de Datos / PostgreSQL · PostGIS · Docker · Triggers**

**Basadas en E1+E2+E3+E4 · Fecha: 16 de julio de 2026**

---

## 📋 Resumen de Tareas BD/Infra

| Prioridad | Tarea | Defecto/RF | Estado | Est. |
|---|---|---|---|---|
| 🔴 Crítico | TASK-001: Ejecutar migraciones faltantes | BUG-001 (tablas ausentes) | ⏳ | 2h |
| 🟠 Alto | Verificar triggers funcionan post-migrate | trg_log_incident_status, etc. | ⏳ | 1h |
| 🟠 Alto | Auditar integridad referencial | FK, CHECK constraints | ⏳ | 1h |
| 🟡 Medio | Completar casos BD no ejecutados | CP-05-04-BD, CP-08-06-BD | ⏳ | 1h |
| 🟡 Medio | Optimizar índices para geom búsquedas | PostGIS GIST indexes | ⏳ | 1.5h |
| 🟢 Bajo | Backup + Restore testing | Procedimientos de recuperación | ⏳ | 1h |

**Total Estimado:** ~8 horas  
**Responsable:** Integrante 3 (Yandris Miguel Rivera Torres)

---

## 🔴 TAREA-BD01: Ejecutar Migraciones Faltantes (BUG-001)

**Ver detalles completos en:** TASKS-CRITICAL-E4.md → TASK-001

**Resumen:** Ejecutar `php artisan migrate` para crear las 4 tablas y triggers faltantes.

### Pre-Requisitos

```bash
# 1. Verificar Docker está corriendo
docker-compose ps

# 2. Verificar conexión a BD
docker-compose exec db psql -U user -d incidencias_db -c "SELECT version();"
```

### Ejecución Principal

```bash
# Opción A: Migrate solo las faltantes
docker-compose exec backend php artisan migrate

# Opción B: Migrate fresh (DESTRUCTIVO - borra datos existentes)
docker-compose exec backend php artisan migrate:fresh --seed
```

**Recomendación:** Usar **Opción A** si hay datos de desarrollo a preservar. **Opción B** si no importa perder datos.

### Tareas Específicas

- [ ] **BD01.1:** Backup actual (por si falla)
  ```bash
  docker-compose exec db pg_dump -U user incidencias_db > backup_pre_migrate.sql
  ```

- [ ] **BD01.2:** Ejecutar migraciones
  ```bash
  docker-compose exec backend php artisan migrate
  # Salida esperada:
  # Migration: 2026_06_15_000009_create_comments_table
  # Migration: 2026_06_15_000010_create_incident_triggers
  # ...
  # Migrated: 44 migrations (...)
  ```

- [ ] **BD01.3:** Verificar que las 44 migraciones muestren "Ran" (no "Pending")
  ```bash
  docker-compose exec backend php artisan migrate:status
  # Todas deben mostrar: ✓ 2026_XX_XX_XXXXXX_...
  ```

- [ ] **BD01.4:** Verificar tablas existen
  ```sql
  docker-compose exec db psql -U user -d incidencias_db << EOF
  \dt                           -- Listar todas las tablas
  \d status_history             -- Detalles tabla
  \d comments
  \d role_permission
  \d menu_permission
  EOF
  ```

- [ ] **BD01.5:** Verificar triggers creados
  ```sql
  docker-compose exec db psql -U user -d incidencias_db << EOF
  \dy                           -- Listar triggers
  -- Esperado: trg_log_incident_status y otros
  EOF
  ```

- [ ] **BD01.6:** Seed datos iniciales (si se hizo migrate:fresh)
  ```bash
  docker-compose exec backend php artisan db:seed
  ```

### Validación de Éxito

```sql
-- Verificar que status_history captura cambios
docker-compose exec db psql -U user -d incidencias_db << EOF
SELECT COUNT(*) as incident_count FROM incidents;
SELECT COUNT(*) as status_history_count FROM status_history;
-- status_history debe tener registros si hay cambios de estado
EOF
```

---

## 🟠 TAREA-BD02: Verificar Triggers Post-Migrate

**Severidad:** Alto  
**Estimado:** 1 hora  
**Contexto:** Después de TASK-BD01, validar que triggers funcionan

### Triggers Esperados (E1)

| Trigger | Tabla | Función | Evento |
|---|---|---|---|
| `trg_log_incident_status` | incidents | Registra cambios de estado en status_history | UPDATE status |
| `trg_auto_assign_location` | incidents | Asigna location_id basado en geom | INSERT/UPDATE |
| `trg_update_updated_at` | incidents | Actualiza timestamp updated_at | UPDATE |
| `trg_prevent_invalid_status_transition` | incidents | Valida transiciones de estado | UPDATE status |

### Validación Manual

- [ ] **BD02.1:** Listar todos los triggers
  ```sql
  docker-compose exec db psql -U user -d incidencias_db -c "\dy"
  ```

- [ ] **BD02.2:** Verificar función del trigger `trg_log_incident_status`
  ```sql
  docker-compose exec db psql -U user -d incidencias_db << EOF
  -- Crear incidencia de prueba
  INSERT INTO incidents (
      title, description, status, priority, 
      category_id, location_id, organization_id, created_by
  ) VALUES (
      'Test', 'Test incident', 'pending', 'alta',
      1, 1, 1, 1
  ) RETURNING id;
  -- Anotarse el ID
  
  -- Cambiar status
  UPDATE incidents SET status = 'in_progress' WHERE id = <ID>;
  
  -- Verificar que se registró en status_history
  SELECT * FROM status_history WHERE incident_id = <ID>;
  -- Debe haber un registro con: 
  -- from_status: 'pending', to_status: 'in_progress', changed_at: <now>
  EOF
  ```

- [ ] **BD02.3:** Verificar trigger de auto-location (E1 + E2 hallazgo H-06)
  ```sql
  -- Insertar incidencia con coordenadas que mapean a Ecuador
  INSERT INTO incidents (
      title, description, status, priority,
      category_id, latitude, longitude, organization_id, created_by
  ) VALUES (
      'Test Geo', 'Test', 'pending', 'media',
      1, 0.3521, -78.1234, 1, 1
  ) RETURNING id, location_id;
  -- location_id debe poblarse automáticamente (si hay polígono)
  -- Si no hay polígono, puede ser NULL (diseño correcto, no es BUG)
  ```

- [ ] **BD02.4:** Verificar que transiciones inválidas se rechazan
  ```sql
  -- Intenta transición inválida: resolved → pending
  UPDATE incidents 
  SET status = 'pending' 
  WHERE status = 'resolved';
  -- Debe fallar con CHECK constraint o trigger
  ```

### Criterio de Aceptación

```gherkin
Scenario: Trigger registra cambios de estado
  Given: Incidencia con status='pending'
  When: UPDATE status='in_progress'
  Then: INSERT automático en status_history
  And: Registro contiene: from_status='pending', to_status='in_progress'

Scenario: Trigger auto-assign location
  Given: INSERT incidents con latitude=0.3521, longitude=-78.1234
  When: Trigger ejecuta
  Then: location_id se puebla automáticamente (si polígono existe)
```

---

## 🟠 TAREA-BD03: Auditar Integridad Referencial

**Severidad:** Alto  
**Estimado:** 1 hora  
**Objetivo:** Verificar que FK y CHECK constraints están correctos

### Validación de FK

```sql
docker-compose exec db psql -U user -d incidencias_db << EOF
-- Listar todas las FK
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
EOF
```

**Esperadas:**

- [ ] `incidents.category_id` → `incident_categories.id`
- [ ] `incidents.location_id` → `locations.id`
- [ ] `incidents.organization_id` → `organizations.id`
- [ ] `incidents.created_by` → `users.id`
- [ ] `assignments.incident_id` → `incidents.id`
- [ ] `assignments.user_id` → `users.id`
- [ ] `status_history.incident_id` → `incidents.id`
- [ ] `comments.incident_id` → `incidents.id`
- [ ] `comments.user_id` → `users.id`

### Validación de CHECK Constraints

```sql
docker-compose exec db psql -U user -d incidencias_db << EOF
-- Listar CHECK constraints
SELECT 
  constraint_name,
  table_name,
  check_clause
FROM information_schema.constraint_column_usage
JOIN information_schema.table_constraints USING (constraint_name)
WHERE constraint_type = 'CHECK'
ORDER BY table_name;
EOF
```

**Esperadas:**

- [ ] `incident_categories.check_is_leaf_category` — Verifica que solo hojas tengan incidencias
- [ ] `incidents.check_valid_coordinates` — Lat [-90,90], Lon [-180,180]
- [ ] `locations.check_valid_level` — Level ∈ {country, province, city, neighborhood}

### Tareas Específicas

- [ ] **BD03.1:** Listar todas las FK y CHECK constraints
- [ ] **BD03.2:** Verificar que cada FK referenciada existe
  ```sql
  -- Test: Intenta INSERT con FK inválido
  INSERT INTO incidents (category_id, ...) VALUES (99999, ...);
  -- Debe fallar: FK violation
  ```
- [ ] **BD03.3:** Verificar que CHECK constraints funcionan
  ```sql
  -- Test: Intenta latitud > 90
  INSERT INTO incidents (latitude, ...) VALUES (91, ...);
  -- Debe fallar: CHECK violation
  ```

### Criterio de Aceptación

```gherkin
Scenario: FK Protection
  Given: Tabla incidents
  When: INSERT con category_id inexistente
  Then: Falla con "foreign key violation"

Scenario: CHECK Constraints
  Given: Tabla incidents
  When: INSERT con latitude=91 (fuera de rango [-90, 90])
  Then: Falla con "check constraint violation"
```

---

## 🟡 TAREA-BD04: Completar Casos BD (CP-05-04-BD, CP-08-06-BD)

**Severidad:** Medio  
**Estimado:** 1 hora

### CP-05-04-BD: Auditar Tabla `locations`

**Contexto (E3):** Verificar estructura de tabla locations (árbol auto-referenciado)

- [ ] **BD04.1:** Describir tabla
  ```sql
  \d locations
  ```
  **Esperadas columnas:**
  - `id` (PK)
  - `parent_id` (FK self-referencia)
  - `name`
  - `level` (ENUM o CHECK: country/province/city/neighborhood)
  - `latitude`, `longitude` (nullable)
  - `geom` (geometry type de PostGIS)

- [ ] **BD04.2:** Verificar integridad de árbol
  ```sql
  -- Contar nodos por nivel
  SELECT level, COUNT(*) 
  FROM locations 
  GROUP BY level;
  
  -- Verificar que no hay ciclos (parent no puede ser descendiente)
  -- Verificar que raíces (countries) tienen parent_id = NULL
  SELECT id, name, level, parent_id 
  FROM locations 
  WHERE level = 'country' 
  AND parent_id IS NOT NULL;
  -- Debe retornar 0 filas (ningún país tiene padre)
  ```

- [ ] **BD04.3:** Validar que geografía está correcta
  ```sql
  -- Contar cuántas provincias de Ecuador
  SELECT COUNT(*) 
  FROM locations 
  WHERE level = 'province' 
  AND parent_id = (SELECT id FROM locations WHERE name = 'Ecuador');
  -- Debe ser 24 (provincias de Ecuador)
  ```

### CP-08-06-BD: Tiempo Promedio Resolución

**Contexto (E3):** Calcular average resolution time

- [ ] **BD04.4:** Ejecutar query que calcula promedio
  ```sql
  SELECT 
    EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 86400 as avg_days
  FROM incidents
  WHERE status = 'resolved' 
  AND resolved_at IS NOT NULL;
  ```
  **Esperado:** Número de días promedio (puede ser NULL si no hay incidencias resueltas)

- [ ] **BD04.5:** Verificar que resolved_at se puebla automáticamente
  ```sql
  -- Crear incidencia, cambiar a resuelto, verificar resolved_at
  INSERT INTO incidents (...) VALUES (...) RETURNING id;
  UPDATE incidents SET status = 'resolved' WHERE id = <ID>;
  SELECT resolved_at FROM incidents WHERE id = <ID>;
  -- resolved_at debe estar poblado con timestamp
  ```

---

## 🟡 TAREA-BD05: Optimizar Índices PostGIS

**Severidad:** Medio  
**Estimado:** 1.5 horas  
**Contexto:** Búsquedas geoespaciales pueden ser lentas sin índices

### Índices Recomendados

```sql
-- GIST index para búsquedas geométricas
CREATE INDEX idx_incidents_geom_gist ON incidents USING GIST(geom);

-- B-tree para búsquedas por estado, organización
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_organization_id ON incidents(organization_id);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);

-- Index en locations.geom para operaciones ST_Contains
CREATE INDEX idx_locations_geom_gist ON locations USING GIST(geom);

-- Índice para FK a locations
CREATE INDEX idx_incidents_location_id ON incidents(location_id);
```

### Tareas

- [ ] **BD05.1:** Listar índices actuales
  ```bash
  docker-compose exec db psql -U user -d incidencias_db << EOF
  SELECT 
    schemaname, tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename;
  EOF
  ```

- [ ] **BD05.2:** Crear índices que falten
  ```sql
  docker-compose exec db psql -U user -d incidencias_db << EOF
  CREATE INDEX idx_incidents_geom_gist ON incidents USING GIST(geom);
  CREATE INDEX idx_incidents_status ON incidents(status);
  CREATE INDEX idx_incidents_organization_id ON incidents(organization_id);
  -- ... otros
  EOF
  ```

- [ ] **BD05.3:** Verificar EXPLAIN PLAN para queries lentes
  ```sql
  -- Query de búsqueda de incidencias por ubicación
  EXPLAIN ANALYZE
  SELECT * FROM incidents
  WHERE organization_id = 1 
  AND status = 'pending'
  ORDER BY created_at DESC;
  -- Debe usar índices, no full table scan
  ```

### Criterio de Aceptación

```gherkin
Scenario: Query usa índice
  Given: SELECT * FROM incidents WHERE organization_id = 1
  When: EXPLAIN ANALYZE
  Then: Plan usa Index Scan (no Seq Scan)
  And: Planning time < 1ms
  And: Execution time < 100ms
```

---

## 🟢 TAREA-BD06: Backup & Restore Testing

**Severidad:** Bajo (buena práctica, no urgente)  
**Estimado:** 1 hora

### Procedimiento

- [ ] **BD06.1:** Realizar backup
  ```bash
  docker-compose exec db pg_dump -U user incidencias_db > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **BD06.2:** Crear BD de test
  ```bash
  docker-compose exec db createdb -U user incidencias_db_test
  ```

- [ ] **BD06.3:** Restaurar desde backup
  ```bash
  docker-compose exec db psql -U user incidencias_db_test < backup_*.sql
  ```

- [ ] **BD06.4:** Verificar que datos se restauraron
  ```sql
  docker-compose exec db psql -U user -d incidencias_db_test << EOF
  SELECT COUNT(*) as incidents FROM incidents;
  SELECT COUNT(*) as users FROM users;
  EOF
  ```

- [ ] **BD06.5:** Limpiar BD de test
  ```bash
  docker-compose exec db dropdb -U user incidencias_db_test
  ```

---

## 📅 Timeline Recomendado

| Tarea | Inicio | Duración | Fin |
|---|---|---|---|
| BD01 (Migraciones) | 2026-07-17 | 2h | 2026-07-17 |
| BD02 (Triggers) | 2026-07-17 | 1h | 2026-07-17 |
| BD03 (Integridad) | 2026-07-18 | 1h | 2026-07-18 |
| BD04 (Casos BD) | 2026-07-18 | 1h | 2026-07-18 |
| BD05 (Índices) | 2026-07-19 | 1.5h | 2026-07-19 |
| BD06 (Backup) | 2026-07-20 | 1h | 2026-07-20 |
| **Re-test casos** | 2026-07-20 | 2h | 2026-07-21 |
| **Buffer** | 2026-07-21 | — | 2026-07-31 |

---

## 🎯 Criterios de Aceptación Global

```gherkin
Feature: BD/Infra E4 Completion
  
  Scenario: Migraciones ejecutadas
    Given: Backend container
    When: php artisan migrate
    Then: 44 migrations ejecutan sin error
    And: Todas muestran "Ran" en migrate:status
  
  Scenario: Triggers funcionan
    Given: Trigger trg_log_incident_status
    When: UPDATE incidents SET status='in_progress'
    Then: INSERT automático en status_history
  
  Scenario: Integridad referencial
    Given: Tabla incidents
    When: INSERT con category_id=99999
    Then: Falla con "foreign key violation"
  
  Scenario: Índices optimizan queries
    Given: 1000+ incidencias
    When: SELECT * FROM incidents WHERE organization_id=1
    Then: EXPLAIN PLAN usa Index Scan
    And: Execution time < 100ms
```

---

**Documento generado:** 16 de julio de 2026  
**Responsable:** Integrante 3 (BD/Infraestructura)  
**Siguiente:** TASKS-QA-E4.md (Validación final)
