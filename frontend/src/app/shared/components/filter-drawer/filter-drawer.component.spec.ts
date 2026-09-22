import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { FilterDrawerComponent } from './filter-drawer.component';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * T-17 — RED: Failing tests for FilterDrawerComponent (D6).
 *
 * S4.1: Desktop — filters always visible, no "Filtros" button.
 * S4.2: Mobile — filters hidden, "Filtros" button visible.
 * S4.3: Click "Filtros" opens drawer with overlay + panel.
 * S4.4: Filter changes apply immediately (no Apply button), drawer stays open.
 * S4.5: Esc / outside-click / "Cerrar" closes drawer.
 */
describe('FilterDrawerComponent', () => {
  let fixture: ComponentFixture<FilterDrawerComponent>;
  let component: FilterDrawerComponent;

  /** Test host component that projects content into the drawer. */
  @Component({
    standalone: true,
    imports: [FilterDrawerComponent],
    template: `
      <app-filter-drawer>
        <div data-testid="filter-content">Search and filter controls</div>
      </app-filter-drawer>
    `,
  })
  class TestHostComponent {}

  function createComponent(isSmall = true): void {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LayoutService,
          useValue: {
            isSmallViewport$: of(isSmall),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.debugElement.query(By.directive(FilterDrawerComponent)).componentInstance;
    fixture.detectChanges();
  }

  describe('desktop viewport (isSmallViewport$ = false) — S4.1', () => {
    beforeEach(() => createComponent(false));

    it('does NOT show "Filtros" toggle button', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      expect(toggleBtn).toBeNull();
    });

    it('does NOT show overlay', () => {
      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      expect(overlay).toBeNull();
    });

    it('does NOT show mobile drawer panel', () => {
      const drawer = fixture.debugElement.query(By.css('[data-filter-drawer]'));
      expect(drawer).toBeNull();
    });

    it('renders the projected filter content inline (S4.1 regression)', () => {
      const content = fixture.debugElement.query(By.css('[data-testid="filter-content"]'));
      expect(content).toBeTruthy();
    });
  });

  describe('mobile viewport (isSmallViewport$ = true) — S4.2', () => {
    beforeEach(() => createComponent(true));

    it('shows "Filtros" toggle button', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.nativeElement.textContent).toContain('Filtros');
    });

    it('hides filter content initially (drawer closed)', () => {
      const drawer = fixture.debugElement.query(By.css('[data-filter-drawer]'));
      // Drawer should not exist or be hidden when isOpen=false
      expect(component.isOpen()).toBe(false);
    });

    it('opens drawer when "Filtros" button clicked (S4.3)', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      toggleBtn.nativeElement.click();
      fixture.detectChanges();

      expect(component.isOpen()).toBe(true);

      // Overlay should appear
      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      expect(overlay).toBeTruthy();

      // Drawer panel should appear
      const drawer = fixture.debugElement.query(By.css('[data-filter-drawer]'));
      expect(drawer).toBeTruthy();
    });

    it('closes drawer when overlay clicked (S4.5)', () => {
      // Open first
      component.isOpen.set(true);
      fixture.detectChanges();

      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      overlay.nativeElement.click();
      fixture.detectChanges();

      expect(component.isOpen()).toBe(false);
    });

    it('closes drawer on Escape key (S4.5)', () => {
      component.isOpen.set(true);
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.isOpen()).toBe(false);
    });

    it('filter content is visible inside drawer when open', () => {
      component.isOpen.set(true);
      fixture.detectChanges();

      const content = fixture.debugElement.query(By.css('[data-testid="filter-content"]'));
      expect(content).toBeTruthy();
    });
  });
});
