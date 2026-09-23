import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MenuTreeComponent } from './menu-tree.component';
import { MenuOption } from '../../../../../core/services/menu-option.service';

describe('MenuTreeComponent', () => {
  let component: MenuTreeComponent;
  let fixture: ComponentFixture<MenuTreeComponent>;

  const mockOptions: MenuOption[] = [
    { id: 'a1', name: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', display_order: 10, is_active: true, parent_id: null, created_at: '2026-09-01' },
    { id: 'a2', name: 'Incidencias', route: '', icon: 'alert-triangle', display_order: 20, is_active: true, parent_id: null, created_at: '2026-09-01' },
    { id: 'a3', name: 'Inicio', route: '/inicio', icon: 'home', display_order: 21, is_active: true, parent_id: 'a2', created_at: '2026-09-01' },
    { id: 'a4', name: 'Mapa', route: '/mapa', icon: 'map', display_order: 22, is_active: true, parent_id: 'a2', created_at: '2026-09-01' },
    { id: 'a5', name: 'Usuarios', route: '/admin/users', icon: 'users', display_order: 30, is_active: true, parent_id: null, created_at: '2026-09-01' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuTreeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuTreeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', mockOptions);
    fixture.componentRef.setInput('selectedId', null);
    fixture.detectChanges();
  });

  it('renders root-level items (no parent_id)', () => {
    const rootItems = component.rootItems();
    expect(rootItems.length).toBe(3); // Dashboard, Incidencias, Usuarios
    expect(rootItems.map((i) => i.name)).toEqual(['Dashboard', 'Incidencias', 'Usuarios']);
  });

  it('renders children nested under their parent', () => {
    const children = component.childrenOf('a2');
    expect(children.length).toBe(2);
    expect(children.map((c) => c.name)).toEqual(['Inicio', 'Mapa']);
  });

  it('shows the add-submenu button only on root/parent items, not on children', () => {
    // No node expanded yet — only the 3 root items render their "+"
    const buttons = (node: HTMLElement) =>
      Array.from(node.querySelectorAll<HTMLButtonElement>('button[title="Agregar submenú"]'));

    expect(buttons(fixture.nativeElement).length).toBe(3); // Dashboard, Incidencias, Usuarios

    // Expand "Incidencias" (a2) — its children render WITHOUT the "+"
    component.toggleExpand('a2');
    fixture.detectChanges();

    const nodeRow = (name: string): HTMLElement | undefined =>
      (Array.from(
        fixture.nativeElement.querySelectorAll('div.tree-node'),
      ) as HTMLElement[]).find((node) => node.querySelector('span.text-sm')?.textContent?.trim() === name);

    expect(buttons(nodeRow('Incidencias')!).length).toBe(1);
    expect(buttons(nodeRow('Inicio')!).length).toBe(0);
    expect(buttons(nodeRow('Mapa')!).length).toBe(0);
  });

  it('emits selected when a node is clicked', () => {
    let emitted: string | null = null;
    component.selected.subscribe((id) => (emitted = id));
    component.selectNode('a3');
    expect(emitted).toBe('a3');
  });

  it('emits create with parent_id when "Agregar menú" is clicked on a parent', () => {
    let emitted: string | null = undefined!;
    component.createRequested.subscribe((parentId) => (emitted = parentId));
    component.requestCreate('a2');
    expect(emitted).toBe('a2');
  });

  it('emits create without parent_id when "Agregar menú" is clicked at root', () => {
    let emitted: string | null = null;
    component.createRequested.subscribe((parentId) => (emitted = parentId));
    component.requestCreate(null);
    expect(emitted).toBeNull();
  });

  it('marks the selected node', () => {
    fixture.componentRef.setInput('selectedId', 'a3');
    fixture.detectChanges();
    expect(component.isSelected('a3')).toBe(true);
    expect(component.isSelected('a1')).toBe(false);
  });

  it('toggles expand/collapse on nodes with children', () => {
    expect(component.isExpanded('a2')).toBe(false);
    component.toggleExpand('a2');
    expect(component.isExpanded('a2')).toBe(true);
    component.toggleExpand('a2');
    expect(component.isExpanded('a2')).toBe(false);
  });

  // ── Phase 3 follow-up (3-level nesting regression guard) ──────────────
  // Verifies that the recursive ng-templateOutlet renders 3-level
  // hierarchies correctly. The spec restricts the "+" button to
  // root items, but the display layer must still render deeper
  // levels when they exist in the data (e.g., imported via DB or
  // created before the spec restriction landed).
  it('renders 3-level nesting when both ancestors are expanded', () => {
    const threeLevel: MenuOption[] = [
      { id: 'r1', name: 'Root', route: '/r', icon: 'home', display_order: 10, is_active: true, parent_id: null, created_at: '2026-09-01' },
      { id: 'm1', name: 'Mid', route: '/m', icon: 'folder', display_order: 11, is_active: true, parent_id: 'r1', created_at: '2026-09-01' },
      { id: 'l1', name: 'Leaf', route: '/l', icon: 'file', display_order: 12, is_active: true, parent_id: 'm1', created_at: '2026-09-01' },
    ];
    fixture.componentRef.setInput('options', threeLevel);
    fixture.detectChanges();

    // Expand both ancestors
    component.toggleExpand('r1');
    component.toggleExpand('m1');
    fixture.detectChanges();

    const rendered = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
    expect(rendered).toContain('Root');
    expect(rendered).toContain('Mid');
    expect(rendered).toContain('Leaf');
  });

  // ── 2026-09-22-sc-menu-tree-double-click-expand ─────────────────────
  // Doble-click en fila con hijos = toggle. Doble-click en hoja = no-op.

  describe('double-click on row', () => {
    function findNodeRow(name: string): HTMLElement | undefined {
      return (
        Array.from(
          fixture.nativeElement.querySelectorAll('div.tree-node'),
        ) as HTMLElement[]
      ).find((node) => node.querySelector('span.text-sm')?.textContent?.trim() === name);
    }

    function dispatchDblClick(el: HTMLElement): void {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }

    it('toggles expand/collapse when double-clicking a row that has children', () => {
      const row = findNodeRow('Incidencias');
      expect(row).toBeTruthy();
      expect(component.isExpanded('a2')).toBe(false);

      dispatchDblClick(row!);
      fixture.detectChanges();

      expect(component.isExpanded('a2')).toBe(true);
    });

    it('does NOT call toggleExpand when double-clicking a leaf row (no children)', () => {
      const row = findNodeRow('Dashboard');
      expect(row).toBeTruthy();

      const toggleSpy = jest.spyOn(component, 'toggleExpand');

      dispatchDblClick(row!);
      fixture.detectChanges();

      expect(toggleSpy).not.toHaveBeenCalled();
    });

    it('applies the has-children class only to rows that have children', () => {
      const withChildren = findNodeRow('Incidencias');
      const leaf = findNodeRow('Dashboard');

      expect(withChildren!.classList.contains('has-children')).toBe(true);
      expect(leaf!.classList.contains('has-children')).toBe(false);
    });
  });

  // ── sc-334 admin-controles-enhancements Phase 3 (D3/R3) — chevron ──

  describe('chevron indicator', () => {
    function findNodeRow(name: string): HTMLElement | undefined {
      return (
        Array.from(
          fixture.nativeElement.querySelectorAll('div.tree-node'),
        ) as HTMLElement[]
      ).find((node) => node.querySelector('span.text-sm')?.textContent?.trim() === name);
    }

    it('renders a chevron button on nodes that have children', () => {
      // "Incidencias" (a2) has children
      const row = findNodeRow('Incidencias');
      expect(row).toBeTruthy();
      const chevron = row!.querySelector('button.expand-btn.chevron-btn');
      expect(chevron).not.toBeNull();
    });

    it('does NOT render a chevron button on leaf nodes (only a spacer)', () => {
      // Dashboard (a1) is a leaf — no children
      const row = findNodeRow('Dashboard');
      expect(row).toBeTruthy();
      expect(row!.querySelector('button.expand-btn.chevron-btn')).toBeNull();
      // Spacer is present so column alignment is preserved
      expect(row!.querySelector('[data-testid="leaf-spacer"]')).not.toBeNull();
    });

    it('marks the chevron as expanded (rotated 90°) when its parent is expanded', () => {
      component.toggleExpand('a2');
      fixture.detectChanges();

      const row = findNodeRow('Incidencias');
      const chevron = row!.querySelector('button.expand-btn.chevron-btn');
      expect(chevron!.classList.contains('chevron-expanded')).toBe(true);
    });

    it('emits a click on the chevron WITHOUT selecting the node (stopPropagation)', () => {
      const selectedSpy = jest.fn();
      component.selected.subscribe(selectedSpy);

      const row = findNodeRow('Incidencias')!;
      const chevron = row.querySelector('button.expand-btn.chevron-btn') as HTMLButtonElement;
      chevron.click();

      // Click on chevron should toggle expand but NOT emit select.
      expect(component.isExpanded('a2')).toBe(true);
      expect(selectedSpy).not.toHaveBeenCalled();
    });
  });
});
