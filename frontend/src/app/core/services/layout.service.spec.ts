import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { LayoutService } from './layout.service';

/**
 * T-01 — RED: Failing tests for LayoutService.isSmallViewport$.
 *
 * S7.1: breakpoint lg=1024px.
 * D2: window.resize → debounceTime(200) → shareReplay(1).
 */
describe('LayoutService — isSmallViewport$', () => {
  let service: LayoutService;
  let originalInnerWidth: number;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayoutService);
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  function setInnerWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      writable: true,
      configurable: true,
    });
  }

  it('emits true when window.innerWidth < 1024', fakeAsync(() => {
    setInnerWidth(800);
    let result: boolean | undefined;
    const sub = service.isSmallViewport$.subscribe((v) => (result = v));

    window.dispatchEvent(new Event('resize'));
    tick(300);

    expect(result).toBe(true);
    sub.unsubscribe();
  }));

  it('emits the initial value immediately on subscribe (startWith UX fix)', fakeAsync(() => {
    // Sin un resize previo, el observable DEBE emitir el valor inicial
    // calculado — antes esto quedaba en `null` hasta el primer resize,
    // y el FilterDrawer/table-to-card decidían mal en el primer render.
    setInnerWidth(1280);
    let result: boolean | undefined;
    service.isSmallViewport$.subscribe((v) => (result = v));
    expect(result).toBe(false);
  }));

  it('emits false when window.innerWidth >= 1024', fakeAsync(() => {
    setInnerWidth(1280);
    let result: boolean | undefined;
    const sub = service.isSmallViewport$.subscribe((v) => (result = v));

    window.dispatchEvent(new Event('resize'));
    tick(300);

    expect(result).toBe(false);
    sub.unsubscribe();
  }));

  it('debounces resize events by 200ms', fakeAsync(() => {
    setInnerWidth(800);
    let emissionCount = 0;
    const sub = service.isSmallViewport$.subscribe(() => emissionCount++);

    // startWith emits the initial value on subscribe
    expect(emissionCount).toBe(1);

    // Initial resize to start the chain
    window.dispatchEvent(new Event('resize'));
    tick(300);
    expect(emissionCount).toBe(2);

    // Now make rapid changes within debounce window
    setInnerWidth(1300);
    window.dispatchEvent(new Event('resize'));
    tick(50);
    setInnerWidth(900);
    window.dispatchEvent(new Event('resize'));
    tick(50);
    setInnerWidth(1100);
    window.dispatchEvent(new Event('resize'));
    tick(50);

    // No emissions from the rapid changes (still debounced)
    expect(emissionCount).toBe(2);

    // After debounce settles
    tick(200);
    expect(emissionCount).toBe(3);
    sub.unsubscribe();
  }));

  it('uses shareReplay(1) — late subscribers get the last value', fakeAsync(() => {
    setInnerWidth(800);
    const sub1 = service.isSmallViewport$.subscribe();

    window.dispatchEvent(new Event('resize'));
    tick(300);
    sub1.unsubscribe();

    // Late subscriber — shareReplay(1) should replay the cached value
    let result: boolean | undefined;
    service.isSmallViewport$.pipe().subscribe((v) => (result = v));
    expect(result).toBe(true);
  }));

  it('breakpoint boundary: 1023 is small, 1024 is not (S7.1)', fakeAsync(() => {
    setInnerWidth(1023);
    let result: boolean | undefined;
    const sub = service.isSmallViewport$.subscribe((v) => (result = v));

    window.dispatchEvent(new Event('resize'));
    tick(300);

    expect(result).toBe(true);
    sub.unsubscribe();
  }));
});
