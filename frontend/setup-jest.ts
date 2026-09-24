import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

if (typeof (globalThis as any).structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (val: unknown) => val;
}
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (val) => val;
}

// jsdom does not implement window.scrollTo — stub to avoid "Not implemented" noise
// in scroll-restoration tests. Real behavior is mocked per-test via jest.spyOn.
if (typeof window !== 'undefined' && !('__scrollToMocked' in window)) {
  try {
    Object.defineProperty(window, 'scrollTo', {
      value: () => {},
      writable: true,
      configurable: true,
    });
    (window as unknown as Record<string, unknown>).__scrollToMocked = true;
  } catch {
    // ignore
  }
}
