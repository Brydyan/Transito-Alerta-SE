import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { ActionDropdownComponent, CardAction } from './action-dropdown.component';

/**
 * T-09 — RED: Failing tests for ActionDropdownComponent (kebab menu).
 *
 * S2.4: card includes action dropdown (⋮).
 * S6.1: dropdown positioned correctly (not off-screen).
 * S6.2: touch-friendly menu items (≥44x44px).
 * S6.4: dropdown closes after action selection.
 * S8.2: touch target size.
 * S8.4: no hover-only content.
 */
describe('ActionDropdownComponent', () => {
  let fixture: ComponentFixture<ActionDropdownComponent>;
  let component: ActionDropdownComponent;

  const sampleActions: CardAction[] = [
    { id: 'edit', label: 'Editar' },
    { id: 'delete', label: 'Eliminar' },
    { id: 'claim', label: 'Reclamar' },
  ];

  function createComponent(actions: CardAction[] = sampleActions): void {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(ActionDropdownComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actions', actions);
    fixture.detectChanges();
  }

  beforeEach(() => createComponent());

  it('renders a trigger button with aria-label "More actions"', () => {
    const trigger = fixture.debugElement.query(By.css('[data-action-dropdown-trigger]'));
    expect(trigger).toBeTruthy();
    expect(trigger.nativeElement.getAttribute('aria-label')).toBe('More actions');
  });

  it('is closed by default', () => {
    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeNull();
  });

  it('toggles open on trigger click', () => {
    const trigger = fixture.debugElement.query(By.css('[data-action-dropdown-trigger]'));
    trigger.nativeElement.click();
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeTruthy();
  });

  it('renders one button per action with correct label', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('[data-action-dropdown-menu] button'));
    expect(items.length).toBe(3);
    expect(items[0].nativeElement.textContent.trim()).toBe('Editar');
    expect(items[1].nativeElement.textContent.trim()).toBe('Eliminar');
    expect(items[2].nativeElement.textContent.trim()).toBe('Reclamar');
  });

  it('emits actionSelected with the action and closes menu', () => {
    const emitSpy = jest.spyOn(component.actionSelected, 'emit');
    component.isOpen.set(true);
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('[data-action-dropdown-menu] button'));
    items[1].nativeElement.click();
    fixture.detectChanges();

    expect(emitSpy).toHaveBeenCalledWith(sampleActions[1]);
    expect(component.isOpen()).toBe(false);
  });

  it('closes menu on Escape key', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeTruthy();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    fixture.debugElement.triggerEventHandler('keydown', event);
    fixture.detectChanges();

    const menuAfter = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menuAfter).toBeNull();
  });

  it('closes menu on click outside', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeTruthy();

    // Simulate click outside by dispatching on document
    document.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const menuAfter = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menuAfter).toBeNull();
  });

  it('has min-h-[44px] on menu items for touch targets (S6.2/S8.2)', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('[data-action-dropdown-menu] button'));
    for (const item of items) {
      expect(item.nativeElement.classList.contains('min-h-[44px]')).toBe(true);
    }
  });

  it('dropdown is absolutely positioned with z-50 (S6.1)', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeTruthy();
    const classes = menu.nativeElement.className;
    expect(classes).toContain('absolute');
    expect(classes).toContain('z-50');
    expect(classes).toContain('right-0');
  });

  it('does not render off-screen — menu has right-0 positioning (S6.1)', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[data-action-dropdown-menu]'));
    expect(menu).toBeTruthy();
    // The menu should have right-0 to align with the trigger's right edge
    expect(menu.nativeElement.className).toContain('right-0');
  });
});

/**
 * Wrapper component for testing ActionDropdown in a realistic context.
 */
@Component({
  selector: 'test-host',
  standalone: true,
  imports: [ActionDropdownComponent],
  template: `
    <app-action-dropdown
      [actions]="actions"
      (actionSelected)="onActionSelected($event)"
    />
  `,
})
class TestHostComponent {
  actions: CardAction[] = [
    { id: 'edit', label: 'Editar' },
    { id: 'delete', label: 'Eliminar' },
  ];
  lastAction: CardAction | null = null;

  onActionSelected(action: CardAction): void {
    this.lastAction = action;
  }
}

describe('ActionDropdownComponent (integration)', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders without crashing', () => {
    const trigger = fixture.debugElement.query(By.css('[data-action-dropdown-trigger]'));
    expect(trigger).toBeTruthy();
  });

  it('wires actionSelected to the host component', () => {
    const trigger = fixture.debugElement.query(By.css('[data-action-dropdown-trigger]'));
    trigger.nativeElement.click();
    fixture.detectChanges();

    const deleteBtn = fixture.debugElement.queryAll(
      By.css('[data-action-dropdown-menu] button'),
    )[1];
    deleteBtn.nativeElement.click();
    fixture.detectChanges();

    expect(host.lastAction).toEqual({ id: 'delete', label: 'Eliminar' });
  });
});
