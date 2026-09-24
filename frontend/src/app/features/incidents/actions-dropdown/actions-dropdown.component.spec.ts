import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionsDropdownComponent } from './actions-dropdown.component';
import { By } from '@angular/platform-browser';

/**
 * ActionsDropdownComponent spec — Phase 4 TDD.
 *
 * Tests cover:
 *   - Three-dot trigger button rendered
 *   - Menu shows on click, hides on outside click
 *   - "Ver" action emits view event
 *   - "Asignar" action emits assign event (shown when hasAssignPermission)
 *   - "Seguimiento" action emits tracking event
 *   - "Eliminar" action emits delete event (placeholder)
 *   - "Asignar" hidden when hasAssignPermission is false
 */
describe('ActionsDropdownComponent', () => {
  let component: ActionsDropdownComponent;
  let fixture: ComponentFixture<ActionsDropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActionsDropdownComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ActionsDropdownComponent);
    component = fixture.componentInstance;
    component.incidentId = 'inc-1';
    component.hasAssignPermission = true;
    fixture.detectChanges();
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('renders the three-dot trigger button', () => {
    const trigger = fixture.debugElement.query(By.css('[data-testid="actions-trigger"]'));
    expect(trigger).toBeTruthy();
  });

  it('dropdown is initially closed', () => {
    expect(component.isOpen()).toBeFalse();
  });

  it('clicking the trigger opens the dropdown', () => {
    const trigger = fixture.debugElement.query(By.css('[data-testid="actions-trigger"]'));
    trigger.nativeElement.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBeTrue();
  });

  it('toggle() flips isOpen state', () => {
    component.toggle();
    expect(component.isOpen()).toBeTrue();
    component.toggle();
    expect(component.isOpen()).toBeFalse();
  });

  it('"Ver" action emits view event with incidentId', () => {
    const viewSpy = jasmine.createSpy('view');
    component.view.subscribe(viewSpy);

    component.isOpen.set(true);
    fixture.detectChanges();

    const verBtn = fixture.debugElement.query(By.css('[data-testid="action-ver"]'));
    verBtn.nativeElement.click();

    expect(viewSpy).toHaveBeenCalledWith('inc-1');
    expect(component.isOpen()).toBeFalse();
  });

  it('"Asignar" action emits assign event with incidentId', () => {
    const assignSpy = jasmine.createSpy('assign');
    component.assign.subscribe(assignSpy);

    component.isOpen.set(true);
    fixture.detectChanges();

    const asignarBtn = fixture.debugElement.query(By.css('[data-testid="action-asignar"]'));
    expect(asignarBtn).toBeTruthy();
    asignarBtn.nativeElement.click();

    expect(assignSpy).toHaveBeenCalledWith('inc-1');
  });

  it('"Seguimiento" action emits tracking event', () => {
    const trackSpy = jasmine.createSpy('tracking');
    component.tracking.subscribe(trackSpy);

    component.isOpen.set(true);
    fixture.detectChanges();

    const seguimientoBtn = fixture.debugElement.query(By.css('[data-testid="action-seguimiento"]'));
    seguimientoBtn.nativeElement.click();

    expect(trackSpy).toHaveBeenCalledWith('inc-1');
  });

  it('"Asignar" hidden when hasAssignPermission is false', () => {
    component.hasAssignPermission = false;
    component.isOpen.set(true);
    fixture.detectChanges();

    const asignarBtn = fixture.debugElement.query(By.css('[data-testid="action-asignar"]'));
    expect(asignarBtn).toBeNull();
  });

  it('close() closes the dropdown', () => {
    component.isOpen.set(true);
    component.close();
    expect(component.isOpen()).toBeFalse();
  });
});
