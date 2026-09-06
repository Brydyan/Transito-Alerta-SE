// REG (sc-325) Fix WARNING-2 (ronda 10) — declaraciones
// ambientales mínimas para que `tsc -b --noEmit` no rompa los
// specs de rutas (`app.routes.verify-*.spec.ts`) que leen
// `app.routes.ts` desde el disco.
//
// El patrón alternativo sería agregar `@types/node` a
// `devDependencies` (el spec ya lo necesita en runtime via
// Jest), pero eso es un cambio de dependencias que el builder
// doc prohíbe sin pasar por `design.md`. Estas declaraciones
// son lo mínimo para que `fs.readFileSync`, `path.join`,
// `path.resolve`, `path.basename`, `path.relative`,
// `fs.readdirSync`, `__dirname` y `__filename` compilen sin
// tocar nada más del repo.
//
// También cubre los `node:fs` / `node:path` / `node:fs/promises`
// equivalentes para los specs que ya usan el prefijo `node:`
// (`auth.interceptor.regression.spec.ts`,
// `layout-tokens.regression.spec.ts`, `sidebar.spec.ts`).
//
// Sólo se incluyen en `tsconfig.spec.json` (via el `include`
// del spec), nunca en el build de la app.

declare const __dirname: string;
declare const __filename: string;

declare module 'fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
}

declare module 'path' {
  export function join(...segments: string[]): string;
  export function resolve(...segments: string[]): string;
  export function basename(path: string, ext?: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
}

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function resolve(...segments: string[]): string;
  export function basename(path: string, ext?: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
