import { Injectable } from '@angular/core';

/**
 * ScrollRestorationService — localStorage backup for critical lists (D14).
 *
 * Angular's `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`
 * restores scroll on back navigation automatically. This service is the
 * manual fallback for complex scenarios (incidents list is critical) and
 * provides the imperative save/restore API used by IncidentListComponent.
 *
 * Keys follow the `scroll-{table}` convention (e.g. `scroll-incidents`).
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestorationService {
  savePosition(key: string, position: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(position));
      }
    } catch {
      // localStorage may be unavailable (SSR, private mode quota) — ignore
    }
  }

  getPosition(key: string): number | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Restore scroll to the saved Y offset for the given key.
   * No-op when nothing was stored or window is unavailable.
   */
  restorePosition(key: string): void {
    const pos = this.getPosition(key);
    if (pos === null) return;
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo(0, pos);
      }
    } catch {
      // ignore
    }
  }

  clearPosition(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }

  /** Convenience: save the current window.scrollY under the given key. */
  saveCurrentPosition(key: string): void {
    try {
      if (typeof window !== 'undefined') {
        this.savePosition(key, window.scrollY);
      }
    } catch {
      // ignore
    }
  }
}
