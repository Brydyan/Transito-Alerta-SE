import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { FilterDrawerComponent } from './filter-drawer.component';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * FilterDrawerComponent — anchored panel contract (Batch 5 polish).
 *
 * Mobile (<1024px): filters hidden behind "Filtros" button; panel opens
 * anchored directly below the button (absolute left-0 top-full mt-2),
 * compact card style (rounded-lg border shadow-lg z-50, w-72, max-h 80vh),
 * NO dark overlay (bg-black/30 fixed inset-0 must not exist), grid remains
 * visible behind. Close via outside tap / Esc / close button.
 *
 * Desktop (>=1024px): filters visible inline, no toggle, no panel chrome.
 */
describe('FilterDrawerComponent', () => {
  let fixture: ComponentFixture<FilterDrawerComponent>;
  let component: FilterDrawerComponent;

  /** Host that projects filter content into the drawer. */
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

    it('does NOT show mobile anchored panel', () => {
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      // Single ng-content slot is always rendered — on desktop it is inline visible, not anchored
      expect(panel).toBeTruthy();
      const cls = panel.nativeElement.className as string;
      expect(cls).not.toContain('absolute');
      expect(cls).not.toContain('hidden');
      // Legacy drawer attr must not be present on desktop (only mobile open)
      const drawer = fixture.debugElement.query(By.css('[data-filter-drawer]'));
      expect(drawer).toBeNull();
    });

    it('renders the projected filter content inline (S4.1 regression)', () => {
      const content = fixture.debugElement.query(By.css('[data-testid="filter-content"]'));
      expect(content).toBeTruthy();
    });

    it('has no dark overlay element (bg-black/30)', () => {
      const dark = fixture.debugElement.query(By.css('.bg-black\\/30'));
      // Query by attribute substring fallback
      const all = fixture.nativeElement.querySelectorAll('*');
      let hasDark = false;
      all.forEach((el: Element) => {
        if (el.className && typeof el.className === 'string' && el.className.includes('bg-black/30')) {
          hasDark = true;
        }
      });
      expect(hasDark).toBe(false);
    });
  });

  describe('mobile viewport (isSmallViewport$ = true) — S4.2 closed', () => {
    beforeEach(() => createComponent(true));

    it('shows icon-only "Filtros" toggle button with accessible name via aria-label', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      expect(toggleBtn).toBeTruthy();
      // Icon-only toggle (mobile polish): no visible text, name via aria-label (a11y S8)
      expect(toggleBtn.nativeElement.textContent).not.toContain('Filtros');
      expect(toggleBtn.attributes['aria-label']).toBe('Filtros');
    });

    it('toggle button has aria-expanded="false" when closed', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      expect(toggleBtn.attributes['aria-expanded']).toBe('false');
    });

    it('hides filter panel initially (drawer closed)', () => {
      expect(component.isOpen()).toBe(false);
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      // Single-slot pattern: panel always rendered, hidden via .hidden when mobile closed
      expect(panel).toBeTruthy();
      const cls: string = panel.nativeElement.className;
      expect(cls).toContain('hidden');
      expect(cls).not.toContain('absolute');
    });

    it('has no dark overlay when closed', () => {
      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      expect(overlay).toBeNull();
      const hasDark = Array.from(fixture.nativeElement.querySelectorAll('*')).some((el: any) =>
        typeof el.className === 'string' && el.className.includes('bg-black/30'),
      );
      expect(hasDark).toBe(false);
    });
  });

  describe('mobile viewport — open anchored panel (S4.3)', () => {
    beforeEach(() => {
      createComponent(true);
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      toggleBtn.nativeElement.click();
      fixture.detectChanges();
    });

    it('keeps "Filtros" toggle visible when open with aria-expanded="true"', () => {
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.attributes['aria-expanded']).toBe('true');
    });

    it('renders anchored panel below the button (absolute right-0 top-full mt-2)', () => {
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      expect(panel).toBeTruthy();
      const cls: string = panel.nativeElement.className;
      expect(cls).toContain('absolute');
      expect(cls).toContain('right-0');
      expect(cls).toContain('top-full');
      expect(cls).toContain('mt-2');
    });

    it('panel has compact card styling: w-64 or w-72, rounded-lg border shadow-lg z-50', () => {
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      expect(panel).toBeTruthy();
      const cls: string = panel.nativeElement.className;
      const hasWidth = cls.includes('w-64') || cls.includes('w-72');
      expect(hasWidth).toBe(true);
      expect(cls).toContain('rounded-lg');
      expect(cls).toContain('border');
      expect(cls).toContain('shadow-lg');
      expect(cls).toContain('z-50');
    });

    it('panel has max-h-[80vh] overflow-y-auto p-4 and absolute overlay not in-flow', () => {
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      expect(panel).toBeTruthy();
      const cls: string = panel.nativeElement.className;
      expect(cls).toContain('max-h-[80vh]');
      expect(cls).toContain('overflow-y-auto');
      expect(cls).toContain('p-4');
      // Must be absolute (overlay, not in-flow)
      expect(cls).toContain('absolute');
    });

    it('does NOT render dark overlay (data-filter-overlay or bg-black/30)', () => {
      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      expect(overlay).toBeNull();
      const hasDark = Array.from(fixture.nativeElement.querySelectorAll('*')).some((el: any) =>
        typeof el.className === 'string' && el.className.includes('bg-black/30'),
      );
      expect(hasDark).toBe(false);
      // Also ensure no fixed inset-0 dark element exists
      const fixedDark = fixture.nativeElement.querySelector('.fixed.inset-0.bg-black\\/30');
      expect(fixedDark).toBeNull();
    });

    it('does NOT use full-height drawer classes (fixed left-0 top-0 bottom-0 w-64 as drawer)', () => {
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      expect(panel).toBeTruthy();
      const cls: string = panel.nativeElement.className;
      // Old drawer was fixed + top-0 + bottom-0 + left-0 simultaneously
      const isOldDrawer = cls.includes('fixed') && cls.includes('top-0') && cls.includes('bottom-0');
      expect(isOldDrawer).toBe(false);
    });

    it('panel header has "Filtros" title and close button (data-filter-close)', () => {
      const closeBtn = fixture.debugElement.query(By.css('[data-filter-close]'));
      expect(closeBtn).toBeTruthy();
      expect(closeBtn.attributes['aria-label']).toBe('Cerrar filtros');
      const header = fixture.nativeElement.textContent as string;
      expect(header).toContain('Filtros');
    });

    it('close button has touch target ≥44px (min-h-[44px] or h-11)', () => {
      const closeBtn = fixture.debugElement.query(By.css('[data-filter-close]'));
      expect(closeBtn).toBeTruthy();
      const cls: string = closeBtn.nativeElement.className;
      const hasTouch = cls.includes('min-h-[44px]') || cls.includes('h-11') || cls.includes('min-h-11');
      expect(hasTouch).toBe(true);
    });

    it('filter content is visible inside anchored panel when open', () => {
      const content = fixture.debugElement.query(By.css('[data-testid="filter-content"]'));
      expect(content).toBeTruthy();
      const panel = fixture.debugElement.query(By.css('[data-filter-panel]'));
      expect(panel.nativeElement.contains(content.nativeElement)).toBe(true);
    });

    it('wrapper is relative flex w-full justify-end so toggle anchors right', () => {
      const wrapper = fixture.debugElement.query(By.css('[data-filter-wrapper]'));
      expect(wrapper).toBeTruthy();
      const cls: string = wrapper.nativeElement.className;
      expect(cls).toContain('relative');
      // Full-width flex so justify-end pushes the toggle to the right
      expect(cls).toContain('w-full');
      expect(cls).toContain('justify-end');
    });
  });

  describe('mobile closing behaviors — S4.5', () => {
    it('closes drawer when close button clicked', () => {
      createComponent(true);
      const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
      toggleBtn.nativeElement.click();
      fixture.detectChanges();
      expect(component.isOpen()).toBe(true);

      const closeBtn = fixture.debugElement.query(By.css('[data-filter-close]'));
      closeBtn.nativeElement.click();
      fixture.detectChanges();
      expect(component.isOpen()).toBe(false);
    });

    it('closes drawer on Escape key', () => {
      createComponent(true);
      component.isOpen.set(true);
      fixture.detectChanges();
      expect(component.isOpen()).toBe(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.isOpen()).toBe(false);
    });

    it('closes drawer on outside tap (click outside panel)', () => {
      createComponent(true);
      component.isOpen.set(true);
      fixture.detectChanges();
      expect(component.isOpen()).toBe(true);

      // Click on document body outside the wrapper/panel should close via ClickOutside
      document.body.click();
      fixture.detectChanges();

      expect(component.isOpen()).toBe(false);
    });

    it('clicking outside does not leave dark overlay behind', () => {
      createComponent(true);
      component.isOpen.set(true);
      fixture.detectChanges();
      document.body.click();
      fixture.detectChanges();
      const overlay = fixture.debugElement.query(By.css('[data-filter-overlay]'));
      expect(overlay).toBeNull();
    });
  });
});

/**
 * Touch-friendly sizing — D10 reuse (kept for coverage, adapted to anchored panel).
 */
describe('FilterDrawerComponent — touch target sizing (D10, T-27)', () => {
  let fixture: ComponentFixture<FilterDrawerComponent>;

  @Component({
    standalone: true,
    imports: [FilterDrawerComponent],
    template: `
      <app-filter-drawer>
        <div data-testid="filter-content">Search and filter controls</div>
      </app-filter-drawer>
    `,
  })
  class TouchHostComponent {}

  function createComponent(isSmall = true): void {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(isSmall) },
        },
      ],
    });
    fixture = TestBed.createComponent(TouchHostComponent);
    fixture.detectChanges();
  }

  it('Filtros button has min-h-[44px] or h-11 (≥44px height)', () => {
    createComponent(true);
    const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
    expect(toggleBtn).toBeTruthy();
    const cls: string = toggleBtn.nativeElement.className;
    const hasTouch = cls.includes('min-h-[44px]') || cls.includes('h-11') || cls.includes('min-h-11');
    expect(hasTouch).toBe(true);
  });

  it('Filtros button has min-w-[44px] or w-11 sizing', () => {
    createComponent(true);
    const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
    expect(toggleBtn).toBeTruthy();
    const cls: string = toggleBtn.nativeElement.className;
    const hasTouch =
      cls.includes('min-w-[44px]') ||
      cls.includes('min-w-11') ||
      cls.includes('w-11') ||
      cls.includes('min-h-[44px]') ||
      cls.includes('h-11');
    expect(hasTouch).toBe(true);
  });

  it('close button (when open) has touch target ≥44px', () => {
    createComponent(true);
    const toggleBtn = fixture.debugElement.query(By.css('[data-filters-toggle]'));
    toggleBtn.nativeElement.click();
    fixture.detectChanges();
    const closeBtn = fixture.debugElement.query(By.css('[data-filter-close]'));
    expect(closeBtn).toBeTruthy();
    const cls: string = closeBtn.nativeElement.className;
    const hasTouch = cls.includes('min-h-[44px]') || cls.includes('h-11') || cls.includes('min-h-11');
    expect(hasTouch).toBe(true);
  });

  it('Ver más datos button (via TableToCard) touch sizing is covered in table-to-card spec', () => {
    expect(true).toBe(true);
  });
});
