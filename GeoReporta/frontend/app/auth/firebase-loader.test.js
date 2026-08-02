/**
 * firebase-loader tests — R12 lazy-load contract + popup cancellation.
 *
 * The loader pulls Firebase's ESM bundles from gstatic via dynamic
 * `import()`. We mock the URL imports (Vitest treats them as module
 * specifiers in vi.mock calls) so the network is never touched in
 * tests. The production sequence is:
 *
 *   1. loadFirebase() (first call) → dynamic-imports firebase-app.js
 *      AND firebase-auth.js, calls initializeApp(firebaseConfig), and
 *      returns a stable handle: { auth, signInWithPopup,
 *      GoogleAuthProvider, signOut }.
 *   2. Subsequent loadFirebase() calls → return the cached handle
 *      WITHOUT touching the network.
 *   3. signInWithGoogle() → resolves UserCredential on success; resolves
 *      null on `auth/popup-closed-by-user`; rethrows on any other error.
 *
 * The brief (orchestrator directive) explicitly chose the ESM dynamic
 * import path because it makes the loader 100% testable via `vi.mock`
 * over the URL — the alternative (UMD `firebase-*-compat.js` injected
 * via <script> tag) requires a test shim over the global `window.firebase`
 * and was rejected by the brief. This stays within the 30-line ceiling
 * for firebase.config.js (see firebase-loader.js for the rationale
 * comment about why the loader uses `firebase-app.js` rather than
 * `firebase-app-compat.js`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoist URL strings + spy handles so vi.mock factories can reference
// them before the rest of the file body evaluates.
const MOCKS = vi.hoisted(() => {
  const SDK_VERSION = '10.13.2';
  const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  return {
    SDK_VERSION,
    BASE,
    APP_URL: `${BASE}/firebase-app.js`,
    AUTH_URL: `${BASE}/firebase-auth.js`,
    fakeInitializeApp: vi.fn(() => ({ name: '[DEFAULT]', _fake: true })),
    fakeGetAuth: vi.fn(() => ({ _auth: true })),
    fakeSignInWithPopup: vi.fn(),
    fakeGoogleAuthProvider: vi.fn(function GoogleAuthProvider() {
      this.providerId = 'google.com';
    }),
    fakeSignOut: vi.fn(() => Promise.resolve()),
  };
});

vi.mock(MOCKS.APP_URL, () => ({
  initializeApp: MOCKS.fakeInitializeApp,
}));

vi.mock(MOCKS.AUTH_URL, () => ({
  getAuth: MOCKS.fakeGetAuth,
  signInWithPopup: MOCKS.fakeSignInWithPopup,
  GoogleAuthProvider: MOCKS.fakeGoogleAuthProvider,
  signOut: MOCKS.fakeSignOut,
}));

// Import AFTER the mocks are registered.
import * as loaderModule from './firebase-loader.js';

beforeEach(() => {
  MOCKS.fakeInitializeApp.mockClear();
  MOCKS.fakeGetAuth.mockClear();
  MOCKS.fakeSignInWithPopup.mockReset();
  MOCKS.fakeGoogleAuthProvider.mockClear();
  MOCKS.fakeSignOut.mockClear();
  // Reset the loader's memoization cache between tests so lazy-load
  // contract is observable per-test. Re-import gets a fresh module
  // instance with a fresh module-private `initPromise`.
  vi.resetModules();
});

/**
 * Import the loader freshly so the memoization cache (a module-
 * private `initPromise` ref) is reset between tests. This mirrors the
 * user clicking "Sign in with Google" twice across two pages — the
 * SDK init happens once per app boot, but our tests want to exercise
 * the "first call" and "second call memoized" contract in isolation.
 */
async function freshLoader() {
  return await import('./firebase-loader.js');
}

describe('firebase-loader (R12 lazy-load)', () => {
  it('R12: lazy-loads Firebase SDK on first call, exposing auth, signInWithPopup, GoogleAuthProvider, and signOut', async () => {
    const { loadFirebase } = await freshLoader();

    const handle = await loadFirebase();

    // initializeApp was called exactly once with the placeholder config.
    expect(MOCKS.fakeInitializeApp).toHaveBeenCalledTimes(1);
    // getAuth was called once with the initialized app.
    expect(MOCKS.fakeGetAuth).toHaveBeenCalledTimes(1);

    expect(handle).toEqual({
      auth: expect.objectContaining({ _auth: true }),
      signInWithPopup: expect.any(Function),
      GoogleAuthProvider: expect.any(Function),
      signOut: expect.any(Function),
    });
  });

  it('memoizes the Firebase load: a second loadFirebase() does not re-import or re-initialize', async () => {
    const { loadFirebase } = await freshLoader();

    const first = await loadFirebase();
    const second = await loadFirebase();

    expect(first).toBe(second);
    // initializeApp must have been called exactly once across both
    // invocations — the lazy-load happens ONCE, not on every call.
    expect(MOCKS.fakeInitializeApp).toHaveBeenCalledTimes(1);
    expect(MOCKS.fakeGetAuth).toHaveBeenCalledTimes(1);
  });

  it('R12: handles popup cancellation gracefully — returns null instead of throwing when Firebase throws auth/popup-closed-by-user', async () => {
    const cancelled = Object.assign(new Error('popup-closed-by-user'), {
      code: 'auth/popup-closed-by-user',
    });
    MOCKS.fakeSignInWithPopup.mockRejectedValueOnce(cancelled);

    const { signInWithGoogle } = await freshLoader();

    // The brief mandates "no error is shown; the user remains on the
    // login page" — contract: resolves to null, does NOT reject.
    await expect(signInWithGoogle()).resolves.toBeNull();
    expect(MOCKS.fakeSignInWithPopup).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-cancel errors from signInWithPopup so the component can render a generic message', async () => {
    const boom = Object.assign(new Error('network down'), {
      code: 'auth/network-error',
    });
    MOCKS.fakeSignInWithPopup.mockRejectedValueOnce(boom);

    const { signInWithGoogle } = await freshLoader();

    // The popup-cancel swallow must NOT swallow real failures — those
    // still flow to the component for the #login-error slot.
    await expect(signInWithGoogle()).rejects.toBe(boom);
  });

  it('signInWithGoogle returns the Firebase UserCredential on a successful popup sign-in', async () => {
    const fakeCredential = {
      user: { uid: 'uid-1', email: 'a@example.com', getIdToken: vi.fn() },
      providerId: 'google.com',
    };
    MOCKS.fakeSignInWithPopup.mockResolvedValueOnce(fakeCredential);

    const { signInWithGoogle } = await freshLoader();

    await expect(signInWithGoogle()).resolves.toBe(fakeCredential);
  });
});

// Reference loaderModule so the import isn't dropped by tree-shaking
// in the test runner; this guarantees a meaningful collection warning
// if the side-effect import stops being pulled in by the suite.
it('module surface exposes the three exports the spec promises', () => {
  expect(typeof loaderModule.loadFirebase).toBe('function');
  expect(typeof loaderModule.signInWithGoogle).toBe('function');
  expect(typeof loaderModule.signOut).toBe('function');
});
