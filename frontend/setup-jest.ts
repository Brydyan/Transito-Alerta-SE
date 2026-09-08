import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

if (typeof (globalThis as any).structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (val) => val;
}
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (val) => val;
}
