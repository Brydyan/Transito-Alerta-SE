/**
 * TypeScript shim for `database/seeds/lib/deps.js`. Ver nota en
 * `guard.d.ts` — este directorio es CommonJS plano, no tiene build.
 */
export const Client: typeof import('pg').Client;
export const bcrypt: typeof import('bcrypt');
