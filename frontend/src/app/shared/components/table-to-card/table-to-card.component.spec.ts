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
});
