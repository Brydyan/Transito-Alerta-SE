/**
 * TypeScript shim for `database/seeds/lib/guard.js`. El archivo es JS plano
 * (CommonJS) y no queremos arrastrar un build completo a `database/seeds/`.
 * Esta declaración expone la forma mínima que `rebuild-feed.ts` consume:
 *
 *   import { enforce } from '../../../database/seeds/lib/guard';
 *   enforce({ scriptName: '...', argv: process.argv.slice(2) });
 */
export interface EnforceOptions {
  scriptName?: string;
  argv?: string[];
}

export interface EnforceResult {
  force: boolean;
  host: string | null;
  blocked: boolean;
}

export function enforce(opts?: EnforceOptions): EnforceResult;
