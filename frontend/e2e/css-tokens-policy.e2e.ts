import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { test, expect } from '@playwright/test';

/**
 * F6.5.4 — regresión: las variables de compatibilidad heredadas del
 * F0 (`--primary-color`, `--accent-color`) NO deben volver a
 * colarse fuera del bloque `:root` de `_variables.css`.
 *
 * El bloque de compatibilidad existe para que las pantallas
 * migradas gradualmente sigan funcionando. Está en cero hits
 * sólo cuando se cierra la fase; mientras tenga consumidores, se
 * conserva (D6). Este spec protege contra una regresión que
 * reintroduciría la variable en un componente nuevo y volvería a
 * extender la vida del andamiaje.
 *
 * Si este spec falla, alguien volvió a usar una variable de
 * compatibilidad: o migra el consumidor al token directo de F0, o
 * documenta por qué el andamiaje sigue siendo necesario. No
 * silenciar.
 */
const FRONTEND_SRC = resolve(__dirname, '..', 'src');

/** Las variables de compatibilidad que F0 introdujo como andamio. */
const LEGACY_VARS = [
  '--primary-color',
  '--secondary-color',
  '--accent-color',
  '--dark-text',
  '--muted-text',
  '--border-color',
  '--light-bg',
] as const;

test.describe('F6.5.4 — Las variables de compatibilidad de F0 no se re-introducen', () => {
  /**
   * Recorre `frontend/src` y junta todos los archivos. La
   * excepción es `_variables.css`, que es donde se declaran y por
   * lo tanto las define — no las «usa» desde fuera.
   */
  function listSrcFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const s = statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (/\.(ts|html|css|scss)$/.test(name)) {
          out.push(full);
        }
      }
    };
    walk(FRONTEND_SRC);
    return out;
  }

  for (const variable of LEGACY_VARS) {
    test(`"${variable}" no aparece fuera de _variables.css`, () => {
      const files = listSrcFiles();
      // Regex SIN flag `g`: `.test()` con `g` es stateful
      // (`lastIndex` se preserva entre llamadas y se saltea matches).
      // Con regex fresca por línea, cada test es independiente.
      const offenders: string[] = [];
      for (const file of files) {
        if (file.endsWith('_variables.css')) continue;
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith('//')) continue;
          if (line.trim().startsWith('*')) continue;
          if (line.trim().startsWith('/*')) continue;
          // `\\b` no funciona con `--` en todos los flavors de
          // regex; uso una variante literal que matchea el inicio
          // del nombre o precedido por `(`, `,`, `:` o espacio.
          const re = new RegExp(`(^|[\\s(,:])(${variable})\\b`);
          if (re.test(line)) {
            offenders.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        }
      }
      expect(
        offenders,
        `estos archivos todavía usan la variable de compatibilidad ${variable} (migra al token F0 o documenta por qué el andamiaje sigue vivo):\n${offenders.join('\n')}`,
      ).toEqual([]);
    });
  }
});
