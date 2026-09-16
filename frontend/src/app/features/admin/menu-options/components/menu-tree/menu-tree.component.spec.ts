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

    const nodeRow = (name: string) =>
      Array.from(
        fixture.nativeElement.querySelectorAll<HTMLElement>('div.tree-node'),
      ).find((node) => node.querySelector('span.text-sm')?.textContent?.trim() === name)!;

    expect(buttons(nodeRow('Incidencias')).length).toBe(1);
    expect(buttons(nodeRow('Inicio')).length).toBe(0);
    expect(buttons(nodeRow('Mapa')).length).toBe(0);
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
});
