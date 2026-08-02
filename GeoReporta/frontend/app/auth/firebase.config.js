/**
 * firebase.config.js — PUBLIC Firebase web configuration (R12).
 *
 * =========================================================================
 * FILLED IN 2026-07-08 — pre-merge chore for the registration + Google
 * auth change. Values come from Firebase Console → Project Settings →
 * General → "Your apps" → Web app config.
 * =========================================================================
 *
 * The values below are PUBLIC by Firebase's design — they're handed to
 * the browser as part of every Firebase web app and Firebase explicitly
 * documents them as safe to commit. They identify the project, not the
 * user; the actual security boundary is the OAuth popup + the ID token
 * the SDK hands back (which the backend re-verifies via
 * KreaitFirebaseTokenVerifier, see PR-2 of the registration+Google-auth
 * SDD change). The Vitest suite mocks the dynamic `import()` of the
 * Firebase SDK (see firebase-loader.test.js), so tests pass with these
 * values present and never touch the network.
 *
 * `measurementId` is included for Analytics future-proofing; PR-4's
 * firebase-loader.js does NOT import the analytics module, so it sits
 * unused until a future change wires it in. Harmless.
 *
 * If you ever need to ROTATE these (suspected leak, project rebuild,
 * etc.): Firebase Console → Project Settings → General → "Your apps" →
 * click the Web app's config snippet → regenerate. The apiKey can be
 * rotated by creating a new API key in Google Cloud Console under the
 * same Firebase project; old keys remain valid until you delete them.
 *
 * SECURITY — do NOT add the SERVICE-ACCOUNT JSON here. That belongs
 * SERVER-SIDE only (backend/.env: FIREBASE_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT_JSON). This file is committed to git on
 * purpose; the file's JSDoc history should NOT migrate the values out
 * of this file.
 */
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyC8yHKN105lcNWq6gVGe3FDQkZrep3csnA',
  authDomain: 'auth-92411.firebaseapp.com',
  projectId: 'auth-92411',
  storageBucket: 'auth-92411.firebasestorage.app',
  messagingSenderId: '1014625968071',
  appId: '1:1014625968071:web:b596491aaa1c6e91bc03e2',
  measurementId: 'G-JEB8H54WPW',
});
