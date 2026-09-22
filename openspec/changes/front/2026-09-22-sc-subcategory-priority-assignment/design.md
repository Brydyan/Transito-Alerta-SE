# Design: Sub-Category Priority Assignment

**Change**: `2026-09-22-sc-subcategory-priority-assignment`  
**Status**: DESIGN  
**Last Updated**: 2026-09-22

---

## Overview

Add a `priority` field to incident sub-categories, allowing admins to assign a default priority level that pre-fills when citizens publish incidents.

**Change Vector**:
- Backend: 1 migration, 1 entity field, 2 DTO updates, 1 service validation rule
- Frontend: 1 interface update, 1 form component enhancement (radio buttons)

---

## D1: Priority Scope — Sub-Categories Only

**Decision**: `priority` field applies **only to sub-categories** (`parent_id IS NOT NULL`). Root categories have `priority = NULL`.

**Why**: 
- Root categories are conceptual groupings (e.g., "Agua"), not actionable categories for incidents
- Sub-categories are the actionable ones (e.g., "Agua Potable (Daño)") and need priority defaults
- Each sub-category under the same root can have different priorities; forcing them to inherit from root would be rigid

**Alternative Rejected**: Priority for all categories. Root categories don't need it; they're never selected in incident creation. Adding it everywhere adds noise and confuses the UX (radio buttons appear for categories that can't be used).

---

## D2: Enum Type — Use Existing IncidentPriority

**Decision**: Priority values are the same as `IncidentPriority` enum:
- `low` → UI label "Bajo"
- `medium` → UI label "Medio"
- `high` → UI label "Alto"
- `critical` → UI label "Crítica"

**Why**: Reuse existing enum. Consistency across the system. Database column can be `VARCHAR(16)` to store the enum string (TypeORM handles mapping).

**Alternative Rejected**: New enum `CategoryPriority`. Creates duplication and maintenance burden if priority values ever change across the system.

**Alternative Rejected**: Store as integer (0-3). Less readable in database; requires a mapping table or constants file.

---

## D3: Default Value — "Medio" (medium)

**Decision**: When creating a new sub-category, priority defaults to `medium` if not explicitly set.

**Why**: 
- "Medio" is the middle ground; least opinionated choice
- Aligns with incident creation flow (which also defaults priority to "Medio")
- Admin can immediately change it if needed

**Alternative Rejected**: No default (NULL). Forces admin to pick on every creation; worse UX.

**Alternative Rejected**: Default to `low`. Bias towards low priority might cause issues to be under-prioritized.

---

## D4: Database Constraint — Application-Level Enforcement

**Decision**: The database allows `priority = NULL` for all categories. The application enforces that sub-categories **must** have a priority (non-NULL at the service layer).

**Why**: 
- Flexibility: allows gradual migration (existing categories remain NULL)
- Simpler migration: no CHECK constraint to drop/recreate
- Validation lives in TypeORM entity + service, which is the DRY place

**Alternative Rejected**: Database CHECK constraint `(parent_id IS NOT NULL) IMPLIES (priority IS NOT NULL)`. PostgreSQL doesn't have direct IMPLIES; would require a computed expression or trigger, adding complexity.

**Where Enforced**:
1. IncidentCategoryEntity: `@Column` with type mapping
2. IncidentCategoriesService.create(): Validate `priority` is provided if `parent_id` is set
3. IncidentCategoriesService.update(): Validate `priority` if updating a sub-category to remove it

---

## D5: Front-End Conditional Visibility

**Decision**: Radio button group for priority selection is **only visible** when `parent_id` is set (sub-category mode).

**Why**: 
- Clear UX: radio buttons only appear when they're relevant
- Prevents confusion: admins don't wonder why a root category has priority options

**Implementation**: In `CategoryFormComponent`:
```typescript
readonly isSubCategory = computed(() => !!this.form.get('parent_id')?.value);
```
Template:
```html
<ng-container *ngIf="isSubCategory()">
  <!-- Radio button group here -->
</ng-container>
```

---

## D6: Default Selection — Pre-Filled on Create

**Decision**: When creating a sub-category, the priority field is pre-filled with `medium`. When editing, the current value is shown.

**Why**: 
- Reduces form friction (one less field to fill)
- Safe default (middle ground)
- Admin can override immediately if needed

**Implementation**:
```typescript
readonly form = this.fb.group({
  name: ['', Validators.required],
  description: [''],
  parent_id: [null],
  priority: ['medium'], // Pre-filled default
});
```

When loading for edit, patch the form:
```typescript
this.form.patchValue({
  priority: category.priority ?? 'medium', // Fallback for old categories
});
```

---

## D7: Incident Priority Pre-Fill Flow

**Decision**: When citizen selects a sub-category in incident creation, the incident's priority is pre-filled from the category's priority.

**Why**: 
- Reduces friction for citizens
- Admins can set sensible defaults per category
- Citizens can still override if needed

**Implementation** (Incident Create Form):
```typescript
onCategorySelected(categoryId: string): void {
  const category = this.categories.find(c => c.id === categoryId);
  if (category && category.priority) {
    this.form.patchValue({ priority: category.priority });
  }
}
```

**Alternative Rejected**: Make priority read-only if category has a default. Users should always be able to override.

---

## Affected Components

### Backend

#### 1. Migration 0063_incident_category_priority.sql

```sql
-- Up
ALTER TABLE incident_categories
ADD COLUMN priority VARCHAR(16) DEFAULT NULL;

-- Down
ALTER TABLE incident_categories
DROP COLUMN priority;
```

---

#### 2. IncidentCategoryEntity

Add field:
```typescript
@Column({ type: 'varchar', length: 16, nullable: true })
priority: IncidentPriority | null;
```

---

#### 3. CreateIncidentCategoryDto

```typescript
export class CreateIncidentCategoryDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority; // NEW — optional at DTO level
}
```

Validation at service layer:
```typescript
if (dto.parent_id && !dto.priority) {
  throw new BadRequestException('Sub-categories must have a priority');
}
```

---

#### 4. UpdateIncidentCategoryDto

```typescript
export class UpdateIncidentCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority; // NEW
}
```

Validation at service layer:
```typescript
if (dto.parent_id && existing.parentId && !dto.priority) {
  // Updating a sub-category; priority must be set
  throw new BadRequestException('Sub-categories must have a priority');
}
```

---

### Frontend

#### 1. IIncidentCategory Interface

```typescript
export interface IIncidentCategory {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  priority?: IncidentPriority | null; // NEW
  created_at: string;
  updated_at: string;
}
```

---

#### 2. ICreateIncidentCategoryDto

```typescript
export interface ICreateIncidentCategoryDto {
  name: string;
  description?: string | null;
  parent_id?: string | null;
  priority?: IncidentPriority; // NEW
}
```

---

#### 3. CategoryFormComponent Enhancement

**New Computed**:
```typescript
readonly isSubCategory = computed(() => !!this.form.get('parent_id')?.value);
```

**Form Update**:
```typescript
readonly form: FormGroup = this.fb.group({
  name: ['', [Validators.required, Validators.maxLength(255)]],
  description: ['', [Validators.maxLength(2000)]],
  parent_id: [null as string | null],
  priority: ['medium' as IncidentPriority], // NEW — default value
});
```

**Template** (Add after parent_id field):
```html
<ng-container *ngIf="isSubCategory()">
  <fieldset>
    <legend>Prioridad</legend>
    <div class="radio-group">
      <label>
        <input type="radio" formControlName="priority" value="low" />
        Bajo
      </label>
      <label>
        <input type="radio" formControlName="priority" value="medium" />
        Medio
      </label>
      <label>
        <input type="radio" formControlName="priority" value="high" />
        Alto
      </label>
      <label>
        <input type="radio" formControlName="priority" value="critical" />
        Crítica
      </label>
    </div>
  </fieldset>
</ng-container>
```

**onSubmit Update**:
```typescript
const dto = {
  name: raw.name,
  description: raw.description?.trim() ? raw.description.trim() : null,
  parent_id: this.isSub() ? raw.parent_id : null,
  priority: this.isSub() ? raw.priority : undefined, // NEW
};
```

---

## No Breaking Changes

**Backward Compatibility**:
- Existing categories without priority remain NULL
- API response includes `priority: null` for root categories
- Incident creation without a category still requires manual priority selection (as before)

---

## Verification Checklist

- [ ] Migration creates `priority` column (nullable)
- [ ] Entity loads/saves priority field
- [ ] Service validates sub-categories have priority
- [ ] API POST/PATCH return priority in response
- [ ] Frontend form shows radio buttons only for sub-categories
- [ ] Default value "medium" is pre-selected on create
- [ ] Editing a sub-category loads existing priority
- [ ] Root categories never show priority field
- [ ] Incident create form pre-fills priority from category
- [ ] All tests pass
- [ ] No regression in category CRUD flows
