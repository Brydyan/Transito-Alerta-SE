import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActionsDropdownComponent,
  MENU_GAP_PX,
  shouldFlipMenuUp,
} from './actions-dropdown.component';
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
    expect(component.isOpen()).toBe(false);
  });

  it('clicking the trigger opens the dropdown', () => {
    const trigger = fixture.debugElement.query(By.css('[data-testid="actions-trigger"]'));
    trigger.nativeElement.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);
  });

  it('toggle() flips isOpen state', () => {
    component.toggle();
    expect(component.isOpen()).toBe(true);
    component.toggle();
    expect(component.isOpen()).toBe(false);
  });

  it('"Ver" action emits view event with incidentId', () => {
    const viewSpy = jest.fn();
    component.view.subscribe(viewSpy);

    component.isOpen.set(true);
    fixture.detectChanges();

    const verBtn = fixture.debugElement.query(By.css('[data-testid="action-ver"]'));
    verBtn.nativeElement.click();

    expect(viewSpy).toHaveBeenCalledWith('inc-1');
    expect(component.isOpen()).toBe(false);
  });

  it('"Asignar" action emits assign event with incidentId', () => {
    const assignSpy = jest.fn();
    component.assign.subscribe(assignSpy);

    component.isOpen.set(true);
    fixture.detectChanges();

    const asignarBtn = fixture.debugElement.query(By.css('[data-testid="action-asignar"]'));
    expect(asignarBtn).toBeTruthy();
    asignarBtn.nativeElement.click();

    expect(assignSpy).toHaveBeenCalledWith('inc-1');
  });

  it('"Seguimiento" action emits tracking event', () => {
    const trackSpy = jest.fn();
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
    expect(component.isOpen()).toBe(false);
  });

  it('flip flag starts false and resets on close', () => {
    expect(component.flippedUp()).toBe(false);
    component.flippedUp.set(true);
    component.close();
    expect(component.flippedUp()).toBe(false);
  });

  it('applies ad-menu--up when the menu is flipped', () => {
    component.isOpen.set(true);
    component.flippedUp.set(true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ad-menu--up'))).toBeTruthy();
  });

  it('does not flip when the menu is not clipped (no clipping ancestor)', () => {
    const trigger = fixture.debugElement.query(By.css('[data-testid="actions-trigger"]'));
    trigger.nativeElement.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    expect(component.flippedUp()).toBe(false);
  });
});

/**
 * Positioning decision — pure function, no DOM. Covers the flip-up rule
 * used when the menu would be clipped by the bottom edge of its scroll
 * container (last rows of the incidents table).
 */
describe('shouldFlipMenuUp', () => {
  it('flips when the menu would be clipped below and there is room above', () => {
    // Table wrapper scrolled: clipTop far above, trigger near the bottom.
    expect(
      shouldFlipMenuUp({ menuHeight: 174, wrapperTop: 557, clipTop: -1369 }),
    ).toBe(true);
  });

  it('stays down when there is no room above either', () => {
    expect(shouldFlipMenuUp({ menuHeight: 174, wrapperTop: 100, clipTop: 0 })).toBe(
      false,
    );
  });

  it('respects the gap between trigger and menu', () => {
    // flippedTop = wrapperTop - menuHeight - gap; 178 - 174 - 4 = 0 → exactly fits.
    expect(shouldFlipMenuUp({ menuHeight: 174, wrapperTop: 178, clipTop: 0 })).toBe(
      true,
    );
    expect(shouldFlipMenuUp({ menuHeight: 174, wrapperTop: 177, clipTop: 0 })).toBe(
      false,
    );
  });

  it('uses a 4px default gap matching the CSS calc', () => {
    expect(MENU_GAP_PX).toBe(4);
  });
});
