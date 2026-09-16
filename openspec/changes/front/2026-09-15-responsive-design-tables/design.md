# Design: Responsive Tables (Card View)

**Change**: `2026-09-15-responsive-design-tables`  
**Architecture**: Angular responsive components + Tailwind media queries

---

## D1: Reusable TableToCardComponent vs. Table-Specific Wrappers

**Decision**: Create **single reusable `TableToCardComponent`** that wraps any `ui-table`, configured via `@Input()` props.

**Rationale**:
- All 5 tables (incidents, users, roles, orgs, categories) share **identical card layout**: 3 fields + "Ver detalle" + dropdown
- Reduces duplication; changes to card styling/behavior apply everywhere
- Simpler testing: test TableToCard once, use 5 times

**Rejected Alternative**: Table-specific card components (incidents-card, users-card, etc.)
- **Why rejected**: Code bloat (5 nearly-identical components), harder to maintain, harder to apply global card design system

**Implementation**:
```typescript
@Component({
  selector: 'table-to-card',
  template: `
    <div [class.hidden]="!(isSmallViewport$ | async)">
      <!-- Card grid on mobile -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        @for (item of items; track item.id) {
          <app-data-card 
            [data]="item" 
            [fields]="cardFields"
            [actions]="cardActions"
            (detailClicked)="onDetail($event)"
            (actionClicked)="onAction($event)">
          </app-data-card>
        }
      </div>
    </div>
    <div [class.hidden]="(isSmallViewport$ | async)">
      <!-- Table on desktop -->
      <ui-table>
        <ng-content></ng-content>
      </ui-table>
    </div>
  `,
})
export class TableToCardComponent {
  @Input() items: any[] = [];
  @Input() cardFields: string[] = []; // ['title', 'status', 'priority']
  @Input() cardActions: Action[] = [];
  @Input() detailRoute: string = '';
  
  isSmallViewport$ = this.layoutService.isSmallViewport();
  
  constructor(private layoutService: LayoutService) {}
}
```

---

## D2: Viewport Detection (LayoutService)

**Decision**: Extend `LayoutService` to expose `isSmallViewport$` Observable (based on window resize).

**Rationale**:
- Centralize responsive state management
- Reusable across components
- Reactive approach (RxJS) integrates with Angular change detection

**Implementation**:
```typescript
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly breakpoint = 1024; // lg breakpoint
  
  readonly isSmallViewport$ = this.windowService.resize$().pipe(
    debounceTime(200),
    map(() => window.innerWidth < this.breakpoint),
    shareReplay(1)
  );
}
```

**Rejected Alternative**: Use `@media` CSS-in-JS + hidden display
- **Why rejected**: No way to query viewport in TypeScript (needed for infinite scroll, filter drawer logic)

---

## D3: Card Field Configuration (Flexible)

**Decision**: Define card fields via **`cardFields: Array<{key, label, format?}>`** passed to TableToCardComponent.

**Rationale**:
- Each table has different 3 fields (title/status/priority for incidents, nombre/email/rol for users)
- Avoid hardcoding field names in component
- Format functions handle badges (status → colored pill), counts, truncation

**Example**:
```typescript
// In IncidentsListComponent
cardFields = [
  { key: 'title', label: 'Título', format: null },
  { key: 'status', label: 'Estado', format: 'badge' },
  { key: 'priority', label: 'Prioridad', format: 'priority-badge' },
];
```

---

## D4: Action Dropdown (Kebab Menu ⋮)

**Decision**: New **`ActionDropdownComponent`** displays edit/delete/more actions in dropdown (no inline buttons on card).

**Rationale**:
- Keeps card compact (no 5+ action buttons side-by-side)
- Familiar mobile UX pattern (WhatsApp, Gmail, etc.)
- Dropdown is touch-friendly (large tap area)

**Implementation**:
```typescript
@Component({
  selector: 'app-action-dropdown',
  template: `
    <div class="relative">
      <button 
        (click)="isOpen = !isOpen"
        class="p-2 hover:bg-gray-100 rounded" 
        aria-label="More actions">
        ⋮
      </button>
      @if (isOpen) {
        <div class="absolute right-0 mt-2 w-48 bg-white rounded shadow-lg z-50">
          @for (action of actions; track action.id) {
            <button 
              (click)="onActionClick(action); isOpen = false"
              class="block w-full text-left px-4 py-2 hover:bg-gray-100">
              {{ action.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class ActionDropdownComponent {
  @Input() actions: Action[] = [];
  @Output() actionSelected = new EventEmitter<Action>();
}
```

---

## D5: Infinite Scroll + "Ver más datos" Button

**Decision**: **No auto-scroll load**. User must click "Ver más datos" button to load next page.

**Rationale**:
- User has explicit control (no surprise data loads)
- Battery/data savings on mobile (user chooses when to load)
- Easier to debug (no timing issues)

**Rejected Alternative**: Auto-load on scroll
- **Why rejected**: Battery drain, data usage concern, can feel jarring, accessibility issue (screen reader users don't know more data loaded)

**Implementation**:
```typescript
// In incidents-list.component.ts
loadMoreData() {
  this.isLoading = true;
  this.incidentsService.list({ page: this.currentPage + 1 }).subscribe(
    (data) => {
      this.items = [...this.items, ...data.items];
      this.currentPage++;
      this.isLoading = false;
      this.hasMore = data.items.length === this.pageSize;
    }
  );
}
```

**Button placement**: Below card grid on mobile only (`hidden lg:hidden` in Tailwind).

---

## D6: Filter Drawer (Mobile Collapsible)

**Decision**: New **`FilterDrawerComponent`** (collapsible drawer, hidden by default on sm/md).

**Rationale**:
- Saves precious mobile screen real estate
- Familiar pattern (YouTube, Twitter mobile filters)
- Desktop: filters always visible (no drawer needed)

**Implementation**:
```typescript
// In FilterDrawerComponent
template: `
  <div class="lg:block md:block hidden">
    <!-- Desktop: always visible -->
    <ng-content></ng-content>
  </div>
  
  <div class="lg:hidden md:hidden block">
    <!-- Mobile: drawer -->
    <button (click)="isOpen = !isOpen">Filtros</button>
    @if (isOpen) {
      <div class="fixed inset-0 z-40 bg-black/30" (click)="isOpen = false"></div>
      <div class="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-lg z-50">
        <ng-content></ng-content>
        <button (click)="isOpen = false">Cerrar</button>
      </div>
    }
  </div>
`;
```

---

## D7: Card Layout (Grid Responsive)

**Decision**: Use Tailwind grid with responsive columns:
- sm (640px): 1 column
- md (768px): 2 columns
- lg (1024px+): Table mode (no cards)

**Rationale**:
- Standard Tailwind breakpoints (consistent with F0 design system)
- `grid-cols-1 md:grid-cols-2` is idiomatic Angular + Tailwind

**CSS Classes**:
```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
  <!-- Card grid here -->
</div>
```

---

## D8: "Ver detalle" Button Prominence

**Decision**: "Ver detalle" button is **always visible** at bottom of card (not hidden in dropdown).

**Rationale**:
- Primary action (users almost always want to see full details before editing)
- Visible without opening menu
- Makes card itself clickable (in addition to button)

**Implementation**:
```html
<div class="card p-4">
  <!-- 3 fields -->
  <div class="mt-4 flex gap-2">
    <button (click)="onDetail(item)" class="flex-1 btn-primary">
      Ver detalle
    </button>
    <app-action-dropdown [actions]="actions"></app-action-dropdown>
  </div>
</div>
```

---

## D9: Sort/Filter State Persistence

**Decision**: Use **localStorage** to persist filter/sort state per table (survives navigation).

**Rationale**:
- Users expect filters to stick when they navigate away/back
- localStorage is simple, no server round-trip
- Key: `incidents-filters`, `users-filters`, etc.

**Alternative Considered**: URL query params
- **Why localStorage chosen**: Cleaner UX; query params are verbose and visible

**Implementation**:
```typescript
// In IncidentsListComponent
onFilterChange(filters: FilterState) {
  localStorage.setItem('incidents-filters', JSON.stringify(filters));
  this.loadData(filters);
}

ngOnInit() {
  const saved = localStorage.getItem('incidents-filters');
  const filters = saved ? JSON.parse(saved) : DEFAULT_FILTERS;
  this.loadData(filters);
}
```

---

## D10: Touch-Friendly Sizing

**Decision**: All interactive elements (buttons, dropdown items) are ≥ 44x44px on mobile (WCAG 2.5.5).

**Rationale**:
- Finger touch accuracy (adults ~10-12mm, kids ~20mm)
- Reduces frustration, misclicks
- Legal compliance (WCAG 2.1 AA)

**Implementation**:
```css
.btn-mobile {
  @apply h-11 px-4 py-2 min-h-[44px]; /* 44px height */
}

.dropdown-item {
  @apply py-2 px-3 min-h-[44px]; /* 44px touch target */
}
```

---

## D11: No Layout Shift (CLS)

**Decision**: Use **CSS `aspect-ratio` or fixed height** on card images; use **skeleton loaders** during async data loads.

**Rationale**:
- Cumulative Layout Shift (CLS) hurts Lighthouse score and UX
- Pre-allocate space before images/data load
- Skeleton loaders show feedback to user

**Implementation**:
```html
<div class="card">
  @if (isLoading) {
    <div class="animate-pulse h-64 bg-gray-200 rounded"></div>
  } @else {
    <img [src]="item.image" class="w-full aspect-video object-cover">
  }
</div>
```

---

## D12: DataCardComponent (Internal)

**Decision**: New **`DataCardComponent`** (internal, used by TableToCard) renders individual card with 3 fields + actions.

**Rationale**:
- Keeps TableToCard focused on layout logic
- DataCard handles field formatting (badges, truncation, icons)
- Reusable in other contexts (search results, favorites, etc.)

**Inputs**:
```typescript
@Input() data: any;
@Input() fields: { key: string; label: string; format?: string }[];
@Input() actions: Action[];
@Output() detailClicked = new EventEmitter<any>();
@Output() actionClicked = new EventEmitter<{action: Action; data: any}>();
```

---

## D13: Breakpoint Definition (Extend _layout.css)

**Decision**: Define Tailwind breakpoints in existing `_layout.css` (no new config file).

**Rationale**:
- Centralize responsive CSS
- Already exists; reuse existing structure
- No duplicate breakpoint definitions

**Update**:
```css
@layer theme {
  @media (max-width: 639px) { /* sm */
    /* mobile card grid rules */
  }
  
  @media (min-width: 640px) and (max-width: 767px) { /* sm-md */
    /* card grid 2-col */
  }
  
  @media (min-width: 768px) and (max-width: 1023px) { /* md-lg */
    /* tablet card grid 2-col */
  }
  
  @media (min-width: 1024px) { /* lg */
    /* table mode; hide cards */
  }
}
```

---

## D14: Scroll Position Restoration

**Decision**: Use **`scrollPositionRestoration: 'enabled'`** in Router + localStorage backup for critical lists.

**Rationale**:
- Angular Router can restore scroll on navigation (built-in)
- Manual localStorage fallback for complex scenarios
- Users expect scroll position to stick when navigating back from detail modal

**Implementation**:
```typescript
// In app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withScrollPositionRestoration('enabled')),
    // ...
  ]
};
```

---

## Testing Strategy

| Layer | Tool | Cases |
|-------|------|-------|
| **Unit** | Jasmine | TableToCard Input validation, ActionDropdown menu toggle, FilterDrawer state |
| **Component** | Jasmine + @testing-library | Card rendering (3 fields), detail button click, dropdown actions |
| **Responsive** | E2E (Playwright) on real devices | iPhone SE, iPad, MacBook; table↔card switch at 1024px |
| **Accessibility** | axe-core, Lighthouse | Touch target ≥44px, focus rings, keyboard nav, WCAG 2.1 AA |
| **Performance** | Lighthouse | CLS < 0.1, LCP < 2.5s, mobile score ≥80 |

---

## Styling Approach (Tailwind Only)

- **No new CSS files** (use `_layout.css`)
- **No CSS-in-JS** (no ngStyle for responsive queries)
- **No utility classes beyond Tailwind** (keep design system consistent)
- **Media queries via Tailwind prefixes** (e.g., `hidden lg:block`)
