import * as fs from 'fs';
import * as path from 'path';
import { PRODUCT_NAME } from '../product-name';

/**
 * MAIL (sc-327) — H.5: el nombre del producto NO aparece
 * escrito a mano en ninguna plantilla; todas lo toman de la
 * constante `PRODUCT_NAME` (H.1).
 *
 * El defecto que este test impide: alguien agrega una
 * plantilla nueva y hardcodea «GeoReporta» en el string
 * del cuerpo, o mete un respaldo «Transito Alerta SE»
 * como el que vivía en `invitation` antes de H.4. Con
 * `PRODUCT_NAME` como única fuente, un cambio de marca
 * se aplica a las 8 plantillas con un solo punto de
 * edición.
 *
 * El test lee `mail-templates.ts` como texto, quita los
 * comentarios (las menciones históricas a «Transito
 * Alerta SE» viven en JSDoc y line comments), y asserte
 * que ningún string literal del archivo contiene
 * `PRODUCT_NAME` directamente.
 */
describe('mail-templates.ts — el nombre del producto no se escribe a mano (MAIL H.5)', () => {
  const filePath = path.join(__dirname, 'mail-templates.ts');
  const source = fs.readFileSync(filePath, 'utf8');

  // Quitamos comentarios de bloque (`/* ... */`, incluyendo
  // JSDoc) y de línea (`// ...`) para que las menciones
  // históricas a "Transito Alerta SE" y "TASE" no sean
  // falsos positivos. El resto del archivo son strings
  // literales (entre backticks, comillas simples, o dobles)
  // o código de control.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('H.5: ningún string literal del archivo contiene el valor de PRODUCT_NAME', () => {
    // Captura strings entre backticks, comillas simples, o
    // comillas dobles. La regex es deliberadamente
    // conservadora: tolera el escape básico de JS y no
    // intenta ser un parser completo.
    const stringLiteral = /`([^`\\]|\\.)*`|'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g;
    const literals = stripped.match(stringLiteral) ?? [];

    const collisions = literals.filter((lit) => lit.includes(PRODUCT_NAME));
    expect(collisions).toEqual([]);
  });

  it('H.5: ningún string literal contiene los nombres viejos del proyecto (defensa contra la regresión de H.4)', () => {
    // Antes de H.4, el respaldo de la plantilla `invitation`
    // era literalmente `'Transito Alerta SE'` y el subject
    // de `password-reset` llevaba «Transito Alerta SE»
    // hardcodeado. Si alguien vuelve a meter uno de los
    // dos, este test lo cazaría — la lista de antiguos
    // nombres es la política que el spec codifica.
    const forbiddenNames = ['Transito Alerta SE', 'Transito Alerta'];
    const stringLiteral = /`([^`\\]|\\.)*`|'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g;
    const literals = stripped.match(stringLiteral) ?? [];
    const collisions = literals.filter((lit) =>
      forbiddenNames.some((name) => lit.includes(name)),
    );
    expect(collisions).toEqual([]);
  });

  it('H.5: la función productFooter() se invoca al menos 8 veces (una por plantilla)', () => {
    // Defensa contra la asimetría documentada en H.3: si
    // sólo se aplica a las plantillas nuevas, el mismo
    // ciudadano recibe el código de verificación de un
    // remitente y la recuperación de contraseña de otro.
    // El conteo de invocaciones a `productFooter()` debe
    // ser ≥ la cantidad de entradas en `TEMPLATES` (8 en
    // la ronda 14). Usar `≥` en vez de `=` tolera que una
    // plantilla use el footer en más de un punto (p.ej.
    // `existing_account_attempt` lo concatena al final
    // del return).
    const footerCallCount = (source.match(/productFooter\(\)/g) ?? []).length;
    expect(footerCallCount).toBeGreaterThanOrEqual(8);
  });
});
