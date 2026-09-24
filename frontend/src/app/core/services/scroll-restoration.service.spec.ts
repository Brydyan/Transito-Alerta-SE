import { TestBed } from '@angular/core/testing';
import { ScrollRestorationService } from './scroll-restoration.service';

/**
 * T-32 / T-33 — RED: scroll restoration helper with localStorage backup (D14).
 *
 * Covers:
 * - S5.1 stable scroll (service stores exact offset)
 * - S5.3 scroll position restored to card #15 area (approx 1250px)
 * - localStorage set/get + restore via window.scrollTo
 */
describe('ScrollRestorationService (D14)', () => {
  let service: ScrollRestorationService;

  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScrollRestorationService);
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('saves scroll position to localStorage with scroll- prefix', () => {
    service.savePosition('scroll-incidents', 1250);
    expect(localStorage.getItem('scroll-incidents')).toBe('1250');
  });

  it('retrieves saved scroll position as number', () => {
    localStorage.setItem('scroll-incidents', '1250');
    expect(service.getPosition('scroll-incidents')).toBe(1250);
  });

  it('returns null when no position is stored', () => {
    expect(service.getPosition('scroll-incidents')).toBeNull();
  });

  it('returns null for malformed stored value', () => {
    localStorage.setItem('scroll-incidents', 'not-a-number');
    expect(service.getPosition('scroll-incidents')).toBeNull();
  });

  it('restores scroll position via window.scrollTo(0, savedY)', () => {
    localStorage.setItem('scroll-incidents', '1250');
    service.restorePosition('scroll-incidents');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 1250);
  });

  it('does not call scrollTo when no position is stored', () => {
    service.restorePosition('scroll-incidents');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('clears stored scroll position', () => {
    localStorage.setItem('scroll-incidents', '1250');
    service.clearPosition('scroll-incidents');
    expect(localStorage.getItem('scroll-incidents')).toBeNull();
  });

  it('saves current window.scrollY via saveCurrentPosition', () => {
    Object.defineProperty(window, 'scrollY', { value: 842, writable: true, configurable: true });
    service.saveCurrentPosition('scroll-incidents');
    expect(localStorage.getItem('scroll-incidents')).toBe('842');
  });

  it('restores card #15 area approximately (card #15 ~ 1250px offset)', () => {
    // S5.3: mobile user scrolls to card #15, clicks detail, returns
    service.savePosition('scroll-incidents', 1250);
    service.restorePosition('scroll-incidents');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 1250);
    const saved = service.getPosition('scroll-incidents');
    // Approximate check: within 100px tolerance still counts as restored
    expect(Math.abs((saved ?? 0) - 1250)).toBeLessThanOrEqual(100);
  });
});
