# Tasks: Sub-Category Priority Assignment

**Change**: `2026-09-22-sc-subcategory-priority-assignment`  
**Total Effort**: ~4-5 hours (backend ~2.5h, frontend ~1.5h, testing ~1h)  
**Phases**: 4 (DB, Backend, Frontend, Testing)

---

## Phase 1: Database Migration (30 min)

### 1.1 Create Migration File

- [ ] Create: `database/migrations/0063_incident_category_priority.sql`
- [ ] Write UP migration:
  ```sql
  ALTER TABLE incident_categories
  ADD COLUMN priority VARCHAR(16) DEFAULT NULL;
  ```
- [ ] Write DOWN migration:
  ```sql
  ALTER TABLE incident_categories
  DROP COLUMN priority;
  ```
- [ ] Save file

**Acceptance**: File exists and is syntactically valid SQL.

---

### 1.2 Update MIGRATION_LOG.md

- [ ] Open `database/MIGRATION_LOG.md`
- [ ] Add entry for 0063:
  ```
  ### 0063 — incident_category_priority
  **Date**: 2026-09-22
  **Purpose**: Add priority field to sub-categories for default incident priority assignment
  **Tables**: incident_categories
  **Changes**: 
    - ADD COLUMN priority VARCHAR(16) NULL
    - Applies to sub-categories (parent_id IS NOT NULL); root categories remain NULL
  **Constraints**: Application enforces NOT NULL for sub-categories via service validation
  **Backward Compatibility**: Existing categories have NULL; no data migration needed
  ```

**Acceptance**: Migration log updated with clear documentation.

---

## Phase 2: Backend Implementation (2.5 hours)

### 2.1 Update IncidentCategoryEntity

- [ ] Open `backend/src/entities/incident-category.entity.ts`
- [ ] Add import for `IncidentPriority` enum (likely from `backend/src/common/enums/incident-priority.enum.ts`)
- [ ] Add column decorator:
  ```typescript
  @Column({ type: 'varchar', length: 16, nullable: true })
  priority: IncidentPriority | null;
  ```
- [ ] Save file
- [ ] Run `npm run typecheck` to verify no TS errors

**Acceptance**: Entity compiles; field is typed as `IncidentPriority | null`.

---

### 2.2 Update CreateIncidentCategoryDto

- [ ] Open `backend/src/modules/incident-categories/dto/create-incident-category.dto.ts`
- [ ] Add field:
  ```typescript
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;
  ```
- [ ] Run `npm run typecheck`

**Acceptance**: DTO compiles; priority is optional.

---

### 2.3 Update UpdateIncidentCategoryDto

- [ ] Open `backend/src/modules/incident-categories/dto/update-incident-category.dto.ts`
- [ ] Add field (same as create DTO):
  ```typescript
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;
  ```
- [ ] Run `npm run typecheck`

**Acceptance**: DTO compiles.

---

### 2.4 Update IncidentCategoriesService.create()

- [ ] Open `backend/src/modules/incident-categories/incident-categories.service.ts`
- [ ] Locate `create()` method
- [ ] Add validation after parent check:
  ```typescript
  if (dto.parent_id && !dto.priority) {
    throw new BadRequestException('Sub-categories must have a priority');
  }
  ```
- [ ] Pass priority to entity creation:
  ```typescript
  const entity = this.categoryRepo.create({
    name: dto.name,
    parentId,
    description: dto.description ?? null,
    priority: dto.priority ?? null, // NEW
  });
  ```

**Acceptance**: Method validates and persists priority.

---

### 2.5 Update IncidentCategoriesService.update()

- [ ] Locate `update()` method
- [ ] Add validation:
  ```typescript
  // If updating a sub-category, priority must be provided
  if (existing.parentId && dto.priority === undefined && dto.parent_id !== null) {
    // Existing sub-category being updated; priority stays or must be explicitly set
    if (!existing.priority && !dto.priority) {
      throw new BadRequestException('Sub-categories must have a priority');
    }
  }
  ```
- [ ] Update entity assignment:
  ```typescript
  if (dto.priority !== undefined) {
    existing.priority = dto.priority;
  }
  ```

**Acceptance**: Service handles priority updates correctly.

---

### 2.6 Unit Tests: Service

- [ ] Open test file: `backend/src/modules/incident-categories/incident-categories.service.spec.ts`
- [ ] Add test: "Create sub-category with default priority 'medium'"
  - Arrange: Create DTO with parent_id, no priority
  - Act: Call service.create()
  - Assert: Entity has priority = 'medium' (or whatever default is in DTO)
- [ ] Add test: "Create sub-category with custom priority 'high'"
  - Arrange: Create DTO with parent_id and priority = 'high'
  - Act: Call service.create()
  - Assert: Entity has priority = 'high'
- [ ] Add test: "Create root category has priority = null"
  - Arrange: Create DTO without parent_id
  - Act: Call service.create()
  - Assert: Entity has priority = null
- [ ] Run: `npm test -- incident-categories.service.spec.ts`

**Acceptance**: All 3 tests pass.

---

### 2.7 Run Backend Linting & TypeCheck

- [ ] Run: `npm run lint -- src/modules/incident-categories`
- [ ] Run: `npm run typecheck`

**Acceptance**: No errors or warnings.

---

### 2.8 Run Full Backend Test Suite

- [ ] Run: `npm test`
- [ ] Verify no new failures (existing tests should still pass)

**Acceptance**: Test suite exits with code 0.

---

## Phase 3: Frontend Implementation (1.5 hours)

### 3.1 Update IIncidentCategory Interface

- [ ] Open `frontend/src/app/features/catalogs/incident-categories/interfaces/iincident-category.interface.ts`
- [ ] Add field to `IIncidentCategory`:
  ```typescript
  priority?: IncidentPriority | null;
  ```
- [ ] Add field to `ICreateIncidentCategoryDto`:
  ```typescript
  priority?: IncidentPriority;
  ```
- [ ] Add field to `IUpdateIncidentCategoryDto`:
  ```typescript
  priority?: IncidentPriority;
  ```
- [ ] Run `npm run typecheck`

**Acceptance**: Interface compiles.

---

### 3.2 Import IncidentPriority Enum

- [ ] Check if `IncidentPriority` enum is already defined in frontend
  - Likely in: `frontend/src/app/common/enums/incident-priority.enum.ts` or similar
- [ ] If not defined, create it with values: `low`, `medium`, `high`, `critical`
- [ ] Import in interfaces file

**Acceptance**: Enum is available and imported.

---

### 3.3 Update CategoryFormComponent: Add isSubCategory Computed

- [ ] Open `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`
- [ ] Add computed property after `isSub`:
  ```typescript
  readonly isSubCategory = computed(() => {
    const parentId = this.form.get('parent_id')?.value;
    return !!parentId;
  });
  ```

**Acceptance**: Computed property defined and typed.

---

### 3.4 Update CategoryFormComponent: Add Priority FormControl

- [ ] Locate form group definition
- [ ] Add priority control:
  ```typescript
  priority: ['medium' as IncidentPriority], // Default value
  ```

**Acceptance**: FormGroup includes priority control with default.

---

### 3.5 Update CategoryFormComponent: onSubmit()

- [ ] Locate `onSubmit()` method
- [ ] Find where DTO is constructed
- [ ] Update:
  ```typescript
  const dto = {
    name: raw.name,
    description: raw.description?.trim() ? raw.description.trim() : null,
    parent_id: this.isEditing()
      ? undefined
      : this.isSub()
        ? raw.parent_id
        : null,
    priority: this.isSub() ? raw.priority : undefined, // NEW
  };
  ```

**Acceptance**: Priority is included in create/update payloads.

---

### 3.6 Update CategoryFormComponent: Load Priority on Edit

- [ ] Locate `loadCategory()` method
- [ ] Update form patch:
  ```typescript
  this.form.patchValue({
    name: category.name,
    description: category.description ?? '',
    parent_id: category.parent_id,
    priority: category.priority ?? 'medium', // NEW (fallback for old categories)
  });
  ```

**Acceptance**: Priority is loaded when editing.

---

### 3.7 Update Template: Add Radio Button Group

- [ ] Open `category-form.component.html`
- [ ] Find where parent_id field is rendered
- [ ] Add after it:
  ```html
  <ng-container *ngIf="isSubCategory()">
    <fieldset class="priority-fieldset">
      <legend>Prioridad</legend>
      <div class="radio-group">
        <label class="radio-label">
          <input 
            type="radio" 
            formControlName="priority" 
            value="low"
            class="radio-input"
          />
          <span>Bajo</span>
        </label>
        <label class="radio-label">
          <input 
            type="radio" 
            formControlName="priority" 
            value="medium"
            class="radio-input"
          />
          <span>Medio</span>
        </label>
        <label class="radio-label">
          <input 
            type="radio" 
            formControlName="priority" 
            value="high"
            class="radio-input"
          />
          <span>Alto</span>
        </label>
        <label class="radio-label">
          <input 
            type="radio" 
            formControlName="priority" 
            value="critical"
            class="radio-input"
          />
          <span>Crítica</span>
        </label>
      </div>
    </fieldset>
  </ng-container>
  ```

**Acceptance**: Radio buttons render only for sub-categories.

---

### 3.8 Add Styling (Optional)

- [ ] Add CSS to `.component.scss` for radio button styling (horizontal layout, proper spacing)
- [ ] Verify it matches existing form style

**Acceptance**: Radio buttons look consistent with form.

---

### 3.9 Frontend Linting & TypeCheck

- [ ] Run: `npm run lint -- category-form.component.ts`
- [ ] Run: `npm run typecheck`

**Acceptance**: No errors.

---

## Phase 4: Testing (1 hour)

### 4.1 Unit Tests: CategoryFormComponent

- [ ] Open test file: `category-form.component.spec.ts`
- [ ] Add test: "isSubCategory computed returns true when parent_id is set"
- [ ] Add test: "Priority field is visible when isSubCategory is true"
- [ ] Add test: "Priority field is hidden when isSubCategory is false"
- [ ] Add test: "Priority defaults to 'medium' on form init"
- [ ] Add test: "onSubmit includes priority for sub-categories"
- [ ] Run: `npm test -- category-form.component.spec.ts`

**Acceptance**: All tests pass.

---

### 4.2 E2E Test: Create Sub-Category with Priority

- [ ] Open: `frontend/e2e/category-form.e2e.ts` or create if needed
- [ ] Add test: "Admin creates sub-category with priority 'high'"
  - Navigate to category create
  - Select parent category
  - Fill name, description
  - Select "Alto" radio button
  - Click Save
  - Assert: Priority field visible, "Alto" selected
  - Assert: API call includes `priority: 'high'`
  - Assert: Toast shows success
- [ ] Add test: "Admin edits sub-category and changes priority"
  - Navigate to edit existing sub-category
  - Assert: Priority field shows current value
  - Change priority to different value
  - Click Save
  - Assert: API call includes new priority
- [ ] Run: `npm run test:e2e`

**Acceptance**: E2E tests pass.

---

### 4.3 E2E Test: Incident Priority Pre-Fill

- [ ] Add test: "Citizen publishes incident with category that has priority"
  - Navigate to incident create
  - Select category with `priority = 'high'`
  - Assert: Incident priority field pre-fills to "Alto"
  - Can change it manually
  - Submit incident
  - Assert: Incident saved with correct priority
- [ ] Run: `npm run test:e2e`

**Acceptance**: Pre-fill test passes.

---

### 4.4 Run Full Frontend Test Suite

- [ ] Run: `npm test`
- [ ] Verify no new failures

**Acceptance**: All tests pass.

---

### 4.5 Integration Test: API + Frontend

- [ ] Start server: `docker compose up -d`
- [ ] Manual test in browser:
  1. Navigate to `/app/categorias/new`
  2. Fill root category form (no parent)
  3. Assert: No priority field
  4. Save root category
  5. Navigate to `/app/categorias/new`
  6. Select parent category
  7. Assert: Priority field appears with "Medio" selected
  8. Change to "Crítica"
  9. Fill name, description
  10. Save
  11. API confirms priority is persisted
  12. Navigate to incident create
  13. Select the category just created
  14. Assert: Incident priority pre-fills to "Crítica"

**Acceptance**: All manual steps pass.

---

### 4.6 Regression Testing

- [ ] Run full test suite: `npm test && npm run test:e2e`
- [ ] Verify category list view unchanged (no priority columns)
- [ ] Verify category delete still works
- [ ] Verify root categories work as before

**Acceptance**: No regressions.

---

## Summary

**Total Tasks**: 32  
**Total Effort**: ~4-5 hours  
**Risk**: Medium (adds field to 2 DTOs + form component + DB migration)  
**Rollback**: Revert migration + code changes

**Delivery Gate**: All 12 specification scenarios must pass + full test suite green.
