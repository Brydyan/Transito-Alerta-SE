# Entity-Relationship Diagram (ERD) — Georeferenced Incidents System

This file contains the relational database design for the **Georeferenced Incidents Management System**, incorporating RBAC authorization, menu management, spatial data, and database-level constraints.

```mermaid
erDiagram
    roles {
        bigint id PK
        string name
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    users {
        bigint id PK
        bigint role_id FK
        string email
        string password
        string first_name
        string last_name
        string phone
        jsonb avatar
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    permissions {
        bigint permission_id PK
        string name
        text description
        string resource
        string action
        timestamp deleted_at
        timestamp created_at
        timestamp updated_at
    }

    role_permission {
        bigint role_permission_id PK
        bigint role_id FK
        bigint permission_id FK
        timestamp deleted_at
        timestamp created_at
        timestamp updated_at
    }

    menus {
        bigint menu_id PK
        bigint parent_id FK "Self-referential"
        string name
        string route
        string icon
        boolean active
        timestamp deleted_at
        timestamp created_at
        timestamp updated_at
    }

    menu_permission {
        bigint menu_permission_id PK
        bigint menu_id FK
        bigint permission_id FK
        timestamp deleted_at
        timestamp created_at
        timestamp updated_at
    }

    sessions {
        string session_id PK
        bigint user_id FK
        string hash
        string ip_address
        text user_agent
        boolean revoked
        timestamp expires_at
        timestamp created_at
    }

    locations {
        bigint id PK
        bigint parent_id FK "Self-referential recursive"
        string name
        string level "ENUM('country', 'province', 'city', 'neighborhood')"
        geometry geom "MultiPolygon (Spatial boundaries SRID 4326)"
        timestamp created_at
        timestamp updated_at
    }

    organizations {
        bigint id PK
        bigint location_id FK "Headquarters city/province"
        string name
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    incident_categories {
        bigint id PK
        bigint parent_id FK "Self-referential recursive"
        bigint organization_id FK "Responsible organization"
        string name
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    incidents {
        bigint id PK
        bigint incident_category_id FK "Must be a leaf category (trigger validation)"
        bigint user_id FK "Reporting user"
        bigint location_id FK "Administrative location (City/Neighborhood)"
        string status "ENUM('pending', 'in_progress', 'resolved')"
        string priority "ENUM('low', 'medium', 'high')"
        timestamp resolution_date
        geometry geom "Point (Exact coordinates SRID 4326)"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    comments {
        bigint id PK
        bigint incident_id FK
        bigint user_id FK "Comment author"
        text message
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    assignments {
        bigint id PK
        bigint incident_id FK
        bigint user_id FK "Assigned user"
        string assignment_role "ENUM('responsible', 'support')"
        timestamp created_at
    }

    status_history {
        bigint id PK
        bigint incident_id FK
        bigint user_id FK "User who performed the change"
        string previous_status
        string new_status
        timestamp created_at
    }

    notifications {
        bigint id PK
        bigint user_id FK "Recipient user"
        bigint incident_id FK "Related incident"
        text message
        boolean read "Default false"
        timestamp created_at
    }

    roles ||--o{ users : "has"
    roles ||--o{ role_permission : "grants"
    permissions ||--o{ role_permission : "assigned_to"
    permissions ||--o{ menu_permission : "linked_to"
    menus ||--o{ menu_permission : "requires"
    menus ||--o{ menus : "contains (parent_id)"
    users ||--o{ incidents : "reports"
    users ||--o{ comments : "writes"
    users ||--o{ sessions : "owns"
    locations ||--o{ locations : "contains (parent_id)"
    locations ||--o{ incidents : "contains"
    locations ||--o{ organizations : "hosts"
    organizations ||--o{ incident_categories : "manages"
    incident_categories ||--o{ incident_categories : "contains (parent_id)"
    incident_categories ||--o{ incidents : "classifies"
    incidents ||--o{ comments : "receives"
    incidents ||--o{ assignments : "has"
    users ||--o{ assignments : "receives"
    incidents ||--o{ status_history : "records"
    users ||--o{ status_history : "executes"
    users ||--o{ notifications : "receives"
    incidents ||--o{ notifications : "generates"
```

## SQL Database Constraints (PostgreSQL + PostGIS)

### 1. Leaf Category Validation Trigger
Prevents creating/updating an incident pointing to a parent (non-leaf) category.

```sql
CREATE OR REPLACE FUNCTION check_is_leaf_category()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM incident_categories
        WHERE parent_id = NEW.incident_category_id
    ) THEN
        RAISE EXCEPTION 'Cannot associate an incident with a parent category (must be a leaf category). ID: %', NEW.incident_category_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_leaf_category
BEFORE INSERT OR UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION check_is_leaf_category();
```

### 2. Automatic Status History Trigger
Records traceability in `status_history` whenever an incident's status is updated.

```sql
CREATE OR REPLACE FUNCTION log_incident_status()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO status_history (incident_id, user_id, previous_status, new_status, created_at)
        VALUES (
            NEW.id,
            COALESCE(NEW.user_id, OLD.user_id),
            OLD.status,
            NEW.status,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_incident_status
AFTER UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION log_incident_status();
```

### 3. Automatic Administrative Geolocation Trigger (PostGIS)
Automatically assigns the administrative location (`location_id`) based on the geographic point (`geom` Point) and location polygons via spatial intersection.

```sql
CREATE OR REPLACE FUNCTION auto_assign_location()
RETURNS TRIGGER AS $$
DECLARE
    v_location_id BIGINT;
BEGIN
    SELECT id INTO v_location_id
    FROM locations
    WHERE ST_Contains(geom, NEW.geom)
    ORDER BY CASE
        WHEN level = 'neighborhood' THEN 1
        WHEN level = 'city' THEN 2
        WHEN level = 'province' THEN 3
        ELSE 4
    END
    LIMIT 1;

    IF v_location_id IS NOT NULL THEN
        NEW.location_id := v_location_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_assign_location
BEFORE INSERT OR UPDATE OF geom ON incidents
FOR EACH ROW
EXECUTE FUNCTION auto_assign_location();
```
