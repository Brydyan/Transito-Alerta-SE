/**
 * TypeScript shim for `database/seeds/lib/rand.js`. Ver nota en
 * `guard.d.ts` — este directorio es CommonJS plano, no tiene build.
 */
export const SEED: number;
export const NS_SEED: string;

export function mulberry32(seed: number): () => number;
export function randInt(rng: () => number, min: number, max: number): number;
export function pick<T>(rng: () => number, arr: readonly T[]): T;
export function deterministicDate(epoch: Date, secondsOffset: number): Date;
export function uuidV5(name: string, namespace: string): string;
