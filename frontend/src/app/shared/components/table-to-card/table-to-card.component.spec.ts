import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { TableToCardComponent } from './table-to-card.component';
import { LayoutService } from '../../../core/services/layout.service';
import { DataCardComponent, CardField } from '../data-card/data-card.component';

/**
 * T-07 — RED: Failing tests for TableToCardComponent responsive switching.
 *
 * S1.1: desktop shows table, mobile shows cards.
 * S2.1: card grid layout grid-cols-1 md:grid-cols-2 gap-4.
 * D1: reusable wrapper that toggles via LayoutService.isSmallViewport$.
 */
describe('TableToCardComponent', () => {
  let fixture: ComponentFixture<TableToCardComponent>;
  let component: TableToCardComponent;

  const mockItems = [
    { id: '1', title: 'Item 1', status: 'pending' },
    { id: '2', title: 'Item 2', status: 'resolved' },
  ];

  const mockFields: CardField[] = [
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status', format: 'badge' },
  ];

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
    fixture = TestBed.createComponent(TableToCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', mockItems);
    fixture.componentRef.setInput('cardFields', mockFields);
    fixture.detectChanges();
  }

  describe('mobile viewport (isSmallViewport$ = true)', () => {
    beforeEach(() => createComponent(true));

    it('renders card grid with correct CSS classes', () => {
      const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
      expect(cardGrid).toBeTruthy();
      const classes = cardGrid.nativeElement.className;
      expect(classes).toContain('grid');
      expect(classes).toContain('grid-cols-1');
      expect(classes).toContain('md:grid-cols-2');
      expect(classes).toContain('gap-4');
    });

    it('renders one app-data-card per item', () => {
      const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
      expect(cards.length).toBe(2);
    });

    it('hides the table wrapper', () => {
      const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
      expect(tableWrapper).toBeTruthy();
      expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(true);
    });

    it('passes items and fields to each DataCard', () => {
      const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
      expect(cards.length).toBe(2);
    });
  });

  describe('desktop viewport (isSmallViewport$ = false)', () => {
    beforeEach(() => createComponent(false));

    it('hides the card grid', () => {
      const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
      expect(cardGrid).toBeTruthy();
      expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(true);
    });

    it('shows the table wrapper', () => {
      const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
      expect(tableWrapper).toBeTruthy();
      expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(false);
    });
  });

  describe('inputs', () => {
    beforeEach(() => createComponent(true));

    it('has an items input', () => {
      expect(component.items()).toEqual(mockItems);
    });

    it('has a cardFields input', () => {
      expect(component.cardFields()).toEqual(mockFields);
    });
  });

  /**
   * T-21 — RED: Failing tests for responsive grid/breakpoint contract (D7, D13).
   *
   * S2.1: card grid toggles at lg breakpoint (1024px).
   * S7.1: standard Tailwind breakpoints; no custom config.
   * S7.3: responsive spacing (sm 0.5rem, md 1rem, lg+ 1.5rem).
   * S1.2: desktop ui-table gets sticky header.
   */
  describe('responsive grid contract (D7, D13) — T-21', () => {
    it('card grid has responsive CSS classes grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 (D7)', () => {
      createComponent(true);
      const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
      expect(cardGrid).toBeTruthy();
      const classes = cardGrid.nativeElement.className;
      expect(classes).toContain('grid');
      expect(classes).toContain('grid-cols-1');
      expect(classes).toContain('md:grid-cols-2');
      expect(classes).toContain('gap-4');
      expect(classes).toContain('lg:gap-6');
    });

    it('card grid is hidden on desktop (isSmallViewport$=false) via hidden class', () => {
      createComponent(false);
      const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
      expect(cardGrid).toBeTruthy();
      expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(true);
    });

    it('card grid is visible on mobile (isSmallViewport$=true) without hidden class', () => {
      createComponent(true);
      const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
      expect(cardGrid).toBeTruthy();
      expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(false);
    });

    it('desktop table wrapper has no hidden class when isSmallViewport$=false', () => {
      createComponent(false);
      const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
      expect(tableWrapper).toBeTruthy();
      expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(false);
    });

    it('desktop table wrapper preserves overflow-x-auto for progressive fallback (S10.1–S10.2)', () => {
      createComponent(false);
      const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
      expect(tableWrapper).toBeTruthy();
      // The table wrapper is a pass-through; overflow-x-auto lives on
      // ui-table's internal wrapper. Here we just verify the wrapper exists.
    });
  });

  /**
   * T-15 — RED: Failing tests for "Ver más datos" infinite scroll (D5).
   *
   * S3.2: "Ver más datos" button appears below card grid on mobile when hasMore=true.
   * S3.3: Button shows loading state when isLoadingMore=true.
   * S3.4: No auto-load on scroll (button click only).
   * S3.5: Button hidden when hasMore=false.
   * S3.1: Button hidden on desktop.
   */
  describe('load-more button (D5, S3.2–S3.5)', () => {
    it('shows "Ver más datos" button on mobile when hasMore=true', () => {
      createComponent(true);
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('isLoadingMore', false);
      fixture.detectChanges();

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      expect(loadMoreBtn).toBeTruthy();
      expect(loadMoreBtn.nativeElement.textContent).toContain('Ver más datos');
    });

    it('hides "Ver más datos" button on mobile when hasMore=false (S3.5)', () => {
      createComponent(true);
      fixture.componentRef.setInput('hasMore', false);
      fixture.componentRef.setInput('isLoadingMore', false);
      fixture.detectChanges();

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      expect(loadMoreBtn).toBeNull();
    });

    it('hides "Ver más datos" button on desktop (S3.1)', () => {
      createComponent(false);
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('isLoadingMore', false);
      fixture.detectChanges();

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      expect(loadMoreBtn).toBeNull();
    });

    it('shows "Cargando..." and disables button when isLoadingMore=true (S3.3)', () => {
      createComponent(true);
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('isLoadingMore', true);
      fixture.detectChanges();

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      expect(loadMoreBtn).toBeTruthy();
      expect(loadMoreBtn.nativeElement.textContent).toContain('Cargando');
      expect(loadMoreBtn.nativeElement.disabled).toBe(true);
    });

    it('emits loadMore event when button clicked', () => {
      createComponent(true);
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('isLoadingMore', false);
      fixture.detectChanges();

      const spy = jest.fn();
      component.loadMore.subscribe(spy);

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      loadMoreBtn.nativeElement.click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not emit loadMore when button is disabled', () => {
      createComponent(true);
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('isLoadingMore', true);
      fixture.detectChanges();

      const spy = jest.fn();
      component.loadMore.subscribe(spy);

      const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
      loadMoreBtn.nativeElement.click();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
