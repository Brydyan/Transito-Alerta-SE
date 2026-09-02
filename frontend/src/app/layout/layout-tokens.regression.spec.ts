import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F0.5.4 — Test de regresión de tokens.
 * Falla si cualquiera de los siguientes aparece en un archivo FUENTE
 * (.ts/.html/.css) bajo `frontend/src/app/layout/`, EXCLUYENDO el propio
 * archivo de test que los menciona en su documentación.
 *
 *   - `#CCFF00` (literal hi-vis)
 *   - `brand-hivis` (token retirado)
 *   - `material-symbols-outlined` (familia de iconos retirada)
 *   - `bi bi-` (Bootstrap Icons retirado del shell)
 *
 * Si F0-F6 reintroduce cualquiera de ellos por descuido, este test rompe el build.
 */
const BANNED = ['#CCFF00', 'brand-hivis', 'material-symbols-outlined', 'bi bi-', 'Barlow'];

// El nombre de este archivo — se ignora al escanear.
const SELF = path.basename(__filename);

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

describe('F0 token regression (layout/)', () => {
  const layoutDir = path.resolve(__dirname);
  const files = walk(layoutDir);

  for (const token of BANNED) {
    it(`does not contain "${token}" under app/layout/`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes(token)) {
          offenders.push(path.relative(layoutDir, file));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
