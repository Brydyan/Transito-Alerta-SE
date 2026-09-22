import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DataCardComponent, CardField, CardAction } from './data-card.component';

/**
 * T-03 — RED: Failing tests for DataCardComponent.
 *
 * S2.2: exactly 3 fields per card.
 * S8.3: screen-reader announcement contract.
 * D12: internal card leaf used by TableToCard.
 */
describe('DataCardComponent', () => {
  let fixture: ComponentFixture<DataCardComponent>;
  let component: DataCardComponent;

  const sampleData: Record<string, unknown> = {
    id: 'item-1',
    title: 'Bache en Av. Principal',
    status: 'pending',
    priority: 'high',
    nombre: 'Carlos',
    email: 'carlos@test.com',
    rol: 'admin',
    descripcion: 'Descripcion larga de prueba que debe ser truncada',
    icon: 'alert-triangle',
  };

  const baseFields: CardField[] = [
    { key: 'title', label: 'Titulo' },
    { key: 'status', label: 'Estado', format: 'badge' },
    { key: 'priority', label: 'Prioridad', format: 'priority-badge' },
  ];

  const baseActions: CardAction[] = [
    { id: 'detail', label: 'Ver detalle' },
    { id: 'edit', label: 'Editar' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(DataCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', sampleData);
    fixture.componentRef.setInput('fields', baseFields);
    fixture.componentRef.setInput('actions', baseActions);
    fixture.detectChanges();
  });

  it('renders exactly 3 field values from the data object', () => {
    const fieldElements = fixture.debugElement.queryAll(By.css('[data-card-field]'));
    expect(fieldElements.length).toBe(3);
  });

  it('displays the correct text value for each field', () => {
    const fieldElements = fixture.debugElement.queryAll(By.css('[data-card-field]'));
    const texts = fieldElements.map((el) => el.nativeElement.textContent.trim());
    expect(texts).toContain('Bache en Av. Principal');
    expect(texts).toContain('pending');
    expect(texts).toContain('high');
  });

  it('applies badge formatting when format is "badge"', () => {
    const badgeEl = fixture.debugElement.query(By.css('[data-card-field="status"]'));
    expect(badgeEl).toBeTruthy();
    const badge = badgeEl.query(By.css('ui-badge'));
    expect(badge).toBeTruthy();
  });

  it('applies priority-badge formatting when format is "priority-badge"', () => {
    const badgeEl = fixture.debugElement.query(By.css('[data-card-field="priority"]'));
    expect(badgeEl).toBeTruthy();
    const badge = badgeEl.query(By.css('ui-badge'));
    expect(badge).toBeTruthy();
  });

  it('emits detailClicked with the data item when detail action is triggered', () => {
    const emitSpy = jest.spyOn(component.detailClicked, 'emit');
    component.onDetailClick();
    expect(emitSpy).toHaveBeenCalledWith(sampleData);
  });

  it('emits actionClicked with action and data when an action is triggered', () => {
    const emitSpy = jest.spyOn(component.actionClicked, 'emit');
    const editAction = baseActions[1];
    component.onActionClick(editAction);
    expect(emitSpy).toHaveBeenCalledWith({ action: editAction, data: sampleData });
  });

  it('has role="article" for screen reader semantics (S8.3)', () => {
    const hostEl = fixture.debugElement.nativeElement;
    expect(hostEl.getAttribute('role')).toBe('article');
  });

  it('has an aria-label with card field values (S8.3)', () => {
    const hostEl = fixture.debugElement.nativeElement;
    const ariaLabel = hostEl.getAttribute('aria-label');
    expect(ariaLabel).toContain('Bache en Av. Principal');
    expect(ariaLabel).toContain('pending');
    expect(ariaLabel).toContain('high');
  });

  it('renders a "Ver detalle" button in the card footer', () => {
    const detailBtn = fixture.debugElement.query(
      By.css('[data-card-detail]'),
    );
    expect(detailBtn).toBeTruthy();
    expect(detailBtn.nativeElement.textContent).toContain('Ver detalle');
  });

  it('truncates long descripcion fields (S2.2 categories)', () => {
    fixture.componentRef.setInput('fields', [
      { key: 'title', label: 'Nombre' },
      { key: 'descripcion', label: 'Descripcion' },
      { key: 'icon', label: 'Icono' },
    ]);
    fixture.detectChanges();

    const descEl = fixture.debugElement.query(By.css('[data-card-field="descripcion"]'));
    expect(descEl).toBeTruthy();
    const el = descEl.nativeElement as HTMLElement;
    const span = el.querySelector('span');
    expect(span?.classList.contains('line-clamp-2')).toBe(true);
  });
});
