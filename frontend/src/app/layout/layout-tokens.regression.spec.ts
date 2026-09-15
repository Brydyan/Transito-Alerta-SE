import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F0.5.4 + sc-323 — Tests de regresión de tokens.
 *
 * Hay dos categorías de reglas:
 *
 * 1. Reglas GLOBALES (afectan todo `frontend/src/`):
 *    - `#CCFF00` (literal hi-vis)
 *    - `brand-navy` (alias bridge retirado por F6, sc-323)
 *    - `brand-hivis` (alias bridge retirado por F6)
 *    - `Barlow` (tipografía retirada)
 *
 * 2. Reglas del SHELL (afectan sólo `frontend/src/app/layout/`):
 *    - `bi bi-` (Bootstrap Icons retirado del shell — los features
 *      fuera del shell siguen usando `bi bi-*`)
 *    - `material-symbols-outlined` (familia de iconos retirada del shell)
 *
 * Si cualquier fase reintroduce un token retirado, este test rompe el build.
 *
 * Nota sc-323: NO se banean los selectores `.badge-status-*` ni las
 * utilidades `status-*` activas (ej. `status-resuelto`) porque design.md
 * (D3) decidió que las clases de badge son canónicas, no bridge consumers.
 * Si se reintroduce un alias bridge nuevo, agregarlo a BANNED explícitamente.
 */
const BANNED_GLOBAL = ['#CCFF00', 'brand-hivis', 'brand-navy', 'Barlow'];
const BANNED_SHELL = ['bi bi-', 'material-symbols-outlined'];

// El nombre de este archivo — se ignora al escanear.
const SELF = path.basename(__filename);

const SHELL_DIR = path.resolve(__dirname);
const SRC_DIR = path.resolve(__dirname, '../../../');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|html|css|scss)$/.test(entry.name) && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

function scan(dir: string, token: string): string[] {
  const offenders: string[] = [];
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(token)) {
      offenders.push(path.relative(dir, file));
    }
  }
  return offenders;
}

describe('F0 token regression (frontend/src/) — global', () => {
  for (const token of BANNED_GLOBAL) {
    it(`does not contain "${token}" under frontend/src/`, () => {
      expect(scan(SRC_DIR, token)).toEqual([]);
    });
  }
});

describe('F0 token regression (app/layout/) — shell-only', () => {
  for (const token of BANNED_SHELL) {
    it(`does not contain "${token}" under app/layout/`, () => {
      expect(scan(SHELL_DIR, token)).toEqual([]);
    });
  }
});
