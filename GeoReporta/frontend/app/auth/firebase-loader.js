/**
 * firebase-loader.js — lazy-loads the Firebase ESM SDK (R12).
 *
 * =========================================================================
 * LOAD STRATEGY
 * =========================================================================
 *
 * The brief (orchestrator directive) chose ESM dynamic import over the
 * `<script>`-injection pattern that `shared/leaflet.js` uses, for one
 * reason: dynamic-import makes the loader 100% unit-testable via
 * `vi.mock` on the URL strings. The `<script>`-injection approach would
 * either fight over `window.firebase` global state across test files or
 * force a `firebase-shim.js` test seam (the design's T4.3). The dynamic-
 * import approach needs neither: the URL is the seam.
 *
 * =========================================================================
 * ESM BUILD, NOT -compat
 * =========================================================================
 *
 * The design (#2304 T4.1) referenced `firebase-app-compat.js` and
 * `firebase-auth-compat.js`, but those are UMD bundles designed to be
 * loaded via a `<script>` tag and to attach to the `window.firebase`
 * global. An ESM `import()` of a UMD bundle FAILS at runtime (the file
 * is not valid ES module source). The correct URLs for an ESM dynamic
 * import are the non-`-compat` builds, `firebase-app.js` and
 * `firebase-auth.js`. Firebase publishes both at every released
 * version, so the brief's intent ("lazy-load via ESM dynamic import")
 * is satisfied cleanly.
 *
 * =========================================================================
 * MEMOIZATION
 * =========================================================================
 *
 * The first call to `loadFirebase()` boots the SDK: dynamic-imports the
 * two ESM modules, calls `initializeApp(firebaseConfig)`, calls
 * `getAuth(app)`, and caches the result. Every subsequent call returns
 * the same handle without touching the network — this is what makes R12
 * "lazy-load on button click, not on page load" true.
 *
 * =========================================================================
 * POPUP CANCEL
 * =========================================================================
 *
 * `signInWithGoogle()` wraps `signInWithPopup`. When the user dismisses
 * the popup (Firebase throws `auth/popup-closed-by-user`), the spec
 * requires NO error UI and the user stays on `/login`. We swallow that
 * one error code and return `null`. Every other Firebase error code
 * propagates so the component can render the spec message
 * ("Token de Google inválido" or "Esta cuenta ya existe...").
 */
import { firebaseConfig } from './firebase.config.js';

const SDK_VERSION = '10.13.2';
const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

// One-shot init. Holds the resolved handle (or the in-flight promise).
let initPromise = null;

async function initFirebase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [{ initializeApp }, authMod] = await Promise.all([
      import(/* @vite-ignore */ `${BASE}/firebase-app.js`),
      import(/* @vite-ignore */ `${BASE}/firebase-auth.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    return {
      auth,
      signInWithPopup: authMod.signInWithPopup,
      GoogleAuthProvider: authMod.GoogleAuthProvider,
      signOut: authMod.signOut,
    };
  })();

  return initPromise;
}

/**
 * Lazy-load the Firebase SDK and return a stable handle. The first call
 * fetches the SDK; every subsequent call returns the cached handle.
 *
 * @returns {Promise<{ auth: object, signInWithPopup: Function,
 *                    GoogleAuthProvider: Function, signOut: Function }>}
 */
export async function loadFirebase() {
  return initFirebase();
}

/**
 * Open the Google sign-in popup. Resolves to the Firebase
 * UserCredential on success, to `null` when the user cancels (spec R12),
 * and re-throws for any other Firebase error code (the component
 * renders the generic error in `#login-error`).
 *
 * @returns {Promise<object|null>}
 */
export async function signInWithGoogle() {
  const { auth, signInWithPopup, GoogleAuthProvider } = await initFirebase();
  try {
    return await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err && err.code === 'auth/popup-closed-by-user') {
      return null;
    }
    throw err;
  }
}

/**
 * Sign the current user out of the Firebase client session. Kept on
 * the surface for symmetry / future use — the project's existing
 * logout path uses `auth.service.logout()` which clears tokens
 * server-side; this is the SDK-level counterpart if needed later.
 *
 * @returns {Promise<void>}
 */
export async function signOut() {
  const { auth, signOut: fbSignOut } = await initFirebase();
  return fbSignOut(auth);
}
