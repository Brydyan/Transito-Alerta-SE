# Proposal: Sub-Category Priority Assignment

**Change**: `2026-09-22-sc-subcategory-priority-assignment`  
**Scope**: Backend (DB, API) + Frontend (Form UI)  
**Date**: 2026-09-22  
**Phase**: F6 (Feature — Catalog Enhancement)  
**Ticket**: TBD (Shortcut)

---

## Intent

Allow admins to assign a **priority level** (`low`, `medium`, `high`, `critical`) to each sub-category at creation/edit time. When a citizen publishes an incident and selects a sub-category, that priority becomes the incident's default priority (user can still override it). This eliminates the need for the citizen to manually select priority on every publication if the sub-category has a predefined one.

**User Flow**:
1. Admin creates sub-category: "Agua Potable (Daño)" with Priority = "high"
2. Citizen publishes incident, selects this sub-category
3. Incident auto-gets Priority = "high" (pre-filled, not mandatory)
4. Citizen can still change it before saving

---

## Scope

### In Scope

**Backend Changes**:
- Database: Add `priority` column to `incident_categories` table (nullable for root categories; NOT NULL for sub-categories)
- Entity: Update `IncidentCategoryEntity` to include `priority` field
- DTOs: Update `CreateIncidentCategoryDto` and `UpdateIncidentCategoryDto`
- Service: Validate priority field
- Controller: API returns priority in category responses

**Frontend Changes**:
- Interface: Update `IIncidentCategory` to include `priority` field
- Form Component: Add radio button group for priority selection
  - Only visible when creating/editing a **sub-category** (`parent_id` is set)
  - Radio options: "Bajo" (low), "Medio" (medium), "Alto" (high), "Crítica" (critical)
  - Default selected: "Medio"
- Incident Create Form: Use category's priority as default for incident priority (pre-fill)

### Out of Scope

- Migration of existing categories (they remain NULL)
- Changes to incident publication workflow beyond pre-filling priority
- Changes to category list display (priority not shown in list view, only in edit form)

---

## Technical Context

### Current State

**Database**:
```sql
CREATE TABLE incident_categories (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES incident_categories(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Entity** (`backend/src/entities/incident-category.entity.ts`):
- Fields: id, name, description, parentId, createdAt, updatedAt, deletedAt
- No priority field currently

**Frontend Interface** (`frontend/src/app/features/catalogs/incident-categories/interfaces/iincident-category.interface.ts`):
- IIncidentCategory: id, name, description, parent_id, created_at, updated_at
- No priority field

### After Changes

**Database**:
- New column: `priority` (VARCHAR or ENUM, default NULL)
- Constraint: NOT NULL if `parent_id IS NOT NULL` (sub-categories only)

**Entity**: Add `priority: IncidentPriority` field

**Frontend**: Add `priority: IncidentPriority | null` to interfaces

**Form**: Add radio button group (visible only for sub-categories)

---

## Database Changes

### Migration 0063

**Name**: `0063_incident_category_priority.sql`

**Up**:
```sql
ALTER TABLE incident_categories
ADD COLUMN priority VARCHAR(16);

-- Optional: Add constraint that priority is NOT NULL for sub-categories (parent_id IS NOT NULL)
-- This is enforced at the application level; the database can allow NULL everywhere for flexibility
```

**Down**:
```sql
ALTER TABLE incident_categories
DROP COLUMN priority;
```

---

## Permission Changes

None. Sub-categories already require `CREATE incident-categories` and `UPDATE incident-categories` permissions. No new permissions needed.

---

## Deliverables

**Backend**:
- [ ] Migration `0063_incident_category_priority.sql`
- [ ] Entity: `IncidentCategoryEntity.priority` field
- [ ] DTOs: `CreateIncidentCategoryDto.priority?`, `UpdateIncidentCategoryDto.priority?`
- [ ] Service: Validation (priority enum values)
- [ ] Controller: API returns priority
- [ ] Tests: Unit + e2e coverage

**Frontend**:
- [ ] Interface: `IIncidentCategory.priority?`
- [ ] Form Component: Radio button group (conditional visibility)
- [ ] Incident Create: Pre-fill priority from selected category
- [ ] Tests: Unit + e2e coverage

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Constraint enforcement (priority required only for subs) | Inconsistent data if not validated | Enforce at service layer; tests verify |
| Backward compatibility (existing categories have NULL) | Incidents can't infer priority from old categories | Expected behavior; citizen selects priority manually as before |
| UI clarity (when to show priority field) | Confusion if shown for root categories | Hide field conditionally (`parent_id !== null`) |

---

## Success Criteria

- [ ] Sub-category creation form displays priority radio buttons
- [ ] Default priority is "Medio" when creating sub-category
- [ ] Priority is persisted to database
- [ ] API returns priority in GET incident-categories responses
- [ ] Incident create form pre-fills priority from selected category
- [ ] Root categories have no priority (NULL in DB)
- [ ] All tests pass (unit + e2e)
- [ ] No regression in category CRUD flows
