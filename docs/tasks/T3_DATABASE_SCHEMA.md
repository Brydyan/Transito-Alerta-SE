# T3: Database Schema + PostGIS

**Responsable:** DB/DevOps  
**Duración:** 1 semana  
**Prioridad:** 🔴 CRÍTICA  
**Bloqueador para:** T1 (Backend)

---

## 📝 Descripción

Diseñar e implementar schema PostgreSQL con PostGIS. Incluye migraciones, índices, constraints y datos de prueba.

---

## 🛠️ Pasos Detallados

### Paso 1: Setup PostgreSQL + PostGIS (Docker)

**File: `docker-compose.yml`**
```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: transito-alerta-db
    environment:
      POSTGRES_DB: transito_alerta_se
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - transito-net

  redis:
    image: redis:7-alpine
    container_name: transito-alerta-redis
    ports:
      - "6379:6379"
    networks:
      - transito-net

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: transito-alerta-api
    environment:
      DB_HOST: postgres
      DB_USER: postgres
      DB_PASSWORD: postgres
      DB_NAME: transito_alerta_se
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    networks:
      - transito-net

volumes:
  postgres_data:

networks:
  transito-net:
```

### Paso 2: Levantar PostgreSQL + PostGIS

```bash
# Navegar a raíz del proyecto
cd /home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE

# Levantar contenedores
docker-compose up -d postgres redis

# Esperar a que PostgreSQL esté listo (~5 seg)
sleep 5

# Verificar que está corriendo
docker ps

# Conectar a PostgreSQL
docker exec -it transito-alerta-db psql -U postgres -d transito_alerta_se

# Verificar PostGIS
SELECT postgis_version();
-- Output: POSTGIS="3.4.0" ...

# Salir (\q)
```

### Paso 3: Crear Schema Inicial

**File: `backend/init.sql` o migrations/001_create_schema.sql**

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('citizen', 'operator', 'admin')),
  device_uuid VARCHAR(255) UNIQUE,
  full_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_device_uuid ON users(device_uuid);

-- ============================================
-- Incident Categories
-- ============================================
CREATE TABLE incident_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO incident_categories (name, description) VALUES
  ('accident', 'Traffic accident'),
  ('traffic_light', 'Broken traffic light'),
  ('blocked_road', 'Road blocked'),
  ('hazard', 'Road hazard'),
  ('vehicle_breakdown', 'Vehicle breakdown'),
  ('weather', 'Weather condition');

-- ============================================
-- Incidents Table (with PostGIS geometry)
-- ============================================
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  geometry GEOMETRY(Point, 4326) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  citizen_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create GiST index for fast spatial queries
CREATE INDEX idx_incidents_geometry ON incidents USING GIST(geometry);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_priority ON incidents(priority);
CREATE INDEX idx_incidents_citizen_id ON incidents(citizen_id);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);

-- Geofencing constraint (Santa Elena canton bounds)
-- Bounds: -80.9 to -80.3 (longitude), -2.1 to -1.7 (latitude)
ALTER TABLE incidents ADD CONSTRAINT check_within_canton CHECK (
  ST_Contains(
    ST_GeomFromText('POLYGON((-80.9 -2.1, -80.3 -2.1, -80.3 -1.7, -80.9 -1.7, -80.9 -2.1))', 4326),
    geometry
  )
);

-- ============================================
-- Incident-Category Junction Table
-- ============================================
CREATE TABLE incident_has_categories (
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES incident_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, category_id)
);

-- ============================================
-- Comments Table
-- ============================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_incident_id ON comments(incident_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);

-- ============================================
-- Comment Images
-- ============================================
CREATE TABLE comment_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comment_images_comment_id ON comment_images(comment_id);

-- ============================================
-- Assignments Table
-- ============================================
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('primary', 'support')),
  assigned_by_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(incident_id, user_id)
);

CREATE INDEX idx_assignments_incident_id ON assignments(incident_id);
CREATE INDEX idx_assignments_user_id ON assignments(user_id);

-- ============================================
-- Status History
-- ============================================
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_status_history_incident_id ON status_history(incident_id);
CREATE INDEX idx_status_history_created_at ON status_history(created_at DESC);

-- ============================================
-- Notifications Table
-- ============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  related_incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- Geofencing Helper Function
-- ============================================
CREATE OR REPLACE FUNCTION validate_location_within_canton()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT ST_Contains(
    ST_GeomFromText('POLYGON((-80.9 -2.1, -80.3 -2.1, -80.3 -1.7, -80.9 -1.7, -80.9 -2.1))', 4326),
    NEW.geometry
  ) THEN
    RAISE EXCEPTION 'Location is outside Santa Elena canton boundaries';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Update Timestamps Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_incidents_update_timestamp
BEFORE UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_comments_update_timestamp
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================
-- Seed Data for Testing
-- ============================================
-- Create test users
INSERT INTO users (email, password_hash, role, full_name, device_uuid) VALUES
  ('citizen1@test.com', '$2b$10$...', 'citizen', 'Juan Pérez', uuid_generate_v4()),
  ('operator1@test.com', '$2b$10$...', 'operator', 'María García', uuid_generate_v4()),
  ('admin@test.com', '$2b$10$...', 'admin', 'Admin User', uuid_generate_v4());

-- Create test incidents within Santa Elena
INSERT INTO incidents (title, description, geometry, latitude, longitude, status, priority, citizen_id) VALUES
  ('Semáforo roto en La Libertad', 'Semáforo no funciona en esquina de calle principal', ST_SetSRID(ST_MakePoint(-80.45, -1.95), 4326), -1.95, -80.45, 'pending', 'high', 
    (SELECT id FROM users WHERE email = 'citizen1@test.com' LIMIT 1)),
  ('Vía bloqueada por construcción', 'Ruta del Spondylus cerrada por obras', ST_SetSRID(ST_MakePoint(-80.55, -2.05), 4326), -2.05, -80.55, 'in_progress', 'medium',
    (SELECT id FROM users WHERE email = 'citizen1@test.com' LIMIT 1));
```

### Paso 4: Crear Migraciones con TypeORM

```bash
cd backend

# Instalar TypeORM CLI
npm install -D typeorm ts-node

# Crear migration
npx typeorm migration:generate src/migrations/1_InitialSchema -d src/database.ts

# Ejecutar migrations
npx typeorm migration:run -d src/database.ts
```

**File: `backend/src/database.ts`**
```typescript
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'transito_alerta_se',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/**/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
```

### Paso 5: Verificar Schema

```bash
# Conectar a DB
docker exec -it transito-alerta-db psql -U postgres -d transito_alerta_se

# Listar tablas
\dt

# Ver columnas de tabla incidents
\d incidents

# Ver índices
\di

# Query PostGIS geometry
SELECT id, title, ST_AsText(geometry) FROM incidents LIMIT 5;

# Verificar geofencing
SELECT COUNT(*) FROM incidents WHERE ST_Contains(
  ST_GeomFromText('POLYGON((-80.9 -2.1, -80.3 -2.1, -80.3 -1.7, -80.9 -1.7, -80.9 -2.1))', 4326),
  geometry
);
```

### Paso 6: Crear Backup Script

**File: `backend/scripts/backup.sh`**
```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p $BACKUP_DIR

docker exec transito-alerta-db pg_dump -U postgres transito_alerta_se > $BACKUP_DIR/backup_$TIMESTAMP.sql

echo "✅ Backup created: $BACKUP_DIR/backup_$TIMESTAMP.sql"
```

```bash
chmod +x backend/scripts/backup.sh
./backend/scripts/backup.sh
```

---

## ✅ Criterios de Aceptación

- [ ] **Contenedores**
  - [ ] PostgreSQL 16 + PostGIS 3.4 running en Docker
  - [ ] `docker-compose up -d` levanta sin errores
  - [ ] Base de datos `transito_alerta_se` creada
  - [ ] PostGIS extensión habilitada

- [ ] **Tablas**
  - [ ] `users` table existe con campos: id, email, password_hash, role, device_uuid
  - [ ] `incidents` table con geometry POINT (4326), status ENUM, priority ENUM
  - [ ] `incident_categories` table con categorías predefinidas
  - [ ] `incident_has_categories` junction table (N:M)
  - [ ] `comments` table con incident_id FK
  - [ ] `comment_images` table
  - [ ] `assignments` table con role (primary, support)
  - [ ] `status_history` table
  - [ ] `notifications` table

- [ ] **Constraints & Validations**
  - [ ] Geofencing constraint en incidents (POLYGON check)
  - [ ] ENUM constraints en status (pending, in_progress, resolved)
  - [ ] ENUM constraints en priority (low, medium, high)
  - [ ] ENUM constraints en role (citizen, operator, admin)
  - [ ] Foreign keys con ON DELETE CASCADE
  - [ ] Unique constraints (email, device_uuid, incident-user pairs)

- [ ] **Índices**
  - [ ] GiST index en incidents.geometry
  - [ ] B-tree indices en status, priority, citizen_id, created_at
  - [ ] Índices en comentarios y notificaciones

- [ ] **Functions & Triggers**
  - [ ] Trigger `update_timestamp` en users, incidents, comments
  - [ ] Function `validate_location_within_canton()` ejecutable

- [ ] **Seed Data**
  - [ ] Al menos 3 usuarios de test (citizen, operator, admin)
  - [ ] Al menos 6 categorías de incidentes
  - [ ] Al menos 5 incidentes dentro de Santa Elena

- [ ] **PostGIS Verification**
  - [ ] `SELECT postgis_version()` retorna version
  - [ ] `SELECT ST_Contains(...)` query funciona
  - [ ] Heat map queries testean

- [ ] **Documentación**
  - [ ] `docker-compose.yml` comentado
  - [ ] `init.sql` con explicaciones
  - [ ] Schema diagram (opcional, pero valorado)
  - [ ] Query examples documentadas

- [ ] **Backup & Recovery**
  - [ ] Script de backup funciona
  - [ ] Backup puede restaurarse

---

## 🔗 Referencias

- **PostgreSQL:** https://www.postgresql.org/
- **PostGIS:** https://postgis.net/
- **TypeORM:** https://typeorm.io/
- **Docker:** https://www.docker.com/

---

**Status:** ⏳ TODO  
**Assigned to:** DB/DevOps  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
