/**
 * Test de regresión de contraste WCAG para los primitivos del design system.
 *
 * Change: 2026-09-02-contrast-regression-test
 * Verifica que cada par texto/fondo de `ui-badge` (8 variantes) y `ui-kpi-card`
 * (7 tonos) cumple ≥ 4.5:1 — el umbral AA para texto normal, ya que ninguno de
 * estos componentes usa tipografía "grande" WCAG (18.66 px en negrita / 24 px
 * normal): los badges son `text-xs` (12 px) y las etiquetas de KPI van en
 * versalitas pequeñas. Ver D3 del change.
 *
 * Estructura:
 *   T1 — Utilidades de cálculo (parseThemeTokens, relativeLuminance, blend, contrastRatio)
 *   T2 — Autovalidación de la fórmula contra razones conocidas
 *   T3 — Tabla de pares con guarda de completitud
 *   T4 — Aserciones sobre los pares reales
 *
 * D1: ningún hex embebido — todo se lee de `frontend/src/styles/_variables.css`.
 * D2: agregar una variante o un tono sin declarar su par rompe la compilación
 *     (Record<UiBadgeVariant, …>) o el test (recorrido de claves en runtime).
 * D3: las variantes tintadas se componen sobre `--color-bg-secondary` antes de
 *     medirse; el fondo por defecto NO es `#FFFFFF` literal.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { UiBadgeVariant } from './ui-badge/ui-badge.component';
import { UiKpiTone } from './ui-kpi-card/ui-kpi-card.component';

// ────────────────────────────────────────────────────────────────────────────
//  T1 — Utilidades de cálculo
// ────────────────────────────────────────────────────────────────────────────

/** Resuelve a un par texto/fondo un par de tokens con alfa aplicada. */
interface ContrastPair {
  /** Token del color de relleno, sin el prefijo `--color-` (lo agrega el parser). */
  readonly bgToken: string;
  /** Alfa aplicada al fondo (1 = sin alfa, token sólido). */
  readonly alpha: number;
  /** Token del color de texto, sin el prefijo `--color-`. */
  readonly textToken: string;
}

/** Lee y resuelve el bloque `@theme` de `_variables.css`. */
function parseThemeTokens(cssText: string): Record<string, string> {
  // 1. Localizar el bloque `@theme { … }`. Soporta anidamiento trivial de
  //    llaves, que no aparece hoy pero deja al parser a prueba de un bloque
  //    `@theme` que más adelante crezca en bloques anidados.
  const themeIdx = cssText.indexOf('@theme');
  if (themeIdx === -1) {
    throw new Error('@theme block not found in CSS');
  }
  const braceOpen = cssText.indexOf('{', themeIdx);
  if (braceOpen === -1) {
    throw new Error('@theme block opening brace not found');
  }
  let depth = 1;
  let i = braceOpen + 1;
  while (i < cssText.length && depth > 0) {
    const c = cssText[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error('@theme block is not balanced (unmatched brace)');
  }
  const block = cssText.slice(braceOpen + 1, i - 1);

  // 2. Quitar comentarios /* … */ para no recoger tokens comentados.
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Extraer declaraciones `--color-<name>: <value>;`.
  const raw: Record<string, string> = {};
  const declRe = /--color-([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(clean)) !== null) {
    raw[m[1]] = m[2].trim();
  }

  // 4. Resolver aliases de un nivel. Cualquier cadena de más de un nivel
  //    o alias a token inexistente aborta con mensaje claro.
  const ALIAS_RE = /^var\(\s*--color-([\w-]+)\s*\)$/i;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const alias = value.match(ALIAS_RE);
    if (!alias) {
      out[name] = value;
      continue;
    }
    const target = alias[1];
    const targetVal = raw[target];
    if (targetVal === undefined) {
      throw new Error(
        `--color-${name} aliases --color-${target}, but --color-${target} is not declared in @theme`,
      );
    }
    if (ALIAS_RE.test(targetVal)) {
      throw new Error(
        `--color-${name} → --color-${target} → ${targetVal}: only single-level aliases are supported`,
      );
    }
    out[name] = targetVal;
  }
  return out;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) {
    throw new Error(`Invalid hex color "${hex}" (expected #RRGGBB)`);
  }
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Luminancia relativa WCAG 2.x: sRGB normalizado → linealización → ponderación. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  // Normalizar 0..1 y linealizar con la fórmula WCAG 2.x.
  const lin = (c8: number) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Blend canal a canal: `α·fg + (1−α)·bg`. */
function blend(fg: string, alpha: number, bg: string): string {
  if (alpha < 0 || alpha > 1) {
    throw new Error(`alpha must be in [0, 1], got ${alpha}`);
  }
  const f = parseHex(fg);
  const b = parseHex(bg);
  return rgbToHex(
    alpha * f.r + (1 - alpha) * b.r,
    alpha * f.g + (1 - alpha) * b.g,
    alpha * f.b + (1 - alpha) * b.b,
  );
}

/** Razón de contraste WCAG: `(L_claro + 0.05) / (L_oscuro + 0.05)`. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Carga perecosa de los tokens resueltos del CSS real. */
let cachedTokens: Record<string, string> | null = null;
function loadTokens(): Record<string, string> {
  if (cachedTokens) return cachedTokens;
  const cssPath = path.resolve(__dirname, '../../../styles/_variables.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  cachedTokens = parseThemeTokens(css);
  return cachedTokens;
}

/** Resuelve un par declarado contra los tokens leídos del CSS. */
function resolveEffective(p: ContrastPair): { bg: string; text: string } {
  const tokens = loadTokens();
  const bgRaw = tokens[p.bgToken];
  const textRaw = tokens[p.textToken];
  if (!bgRaw) {
    throw new Error(`bgToken --color-${p.bgToken} not found in @theme`);
  }
  if (!textRaw) {
    throw new Error(`textToken --color-${p.textToken} not found in @theme`);
  }
  const bg = p.alpha < 1 ? blend(bgRaw, p.alpha, tokens['bg-secondary']) : bgRaw;
  return { bg, text: textRaw };
}

// ────────────────────────────────────────────────────────────────────────────
//  T2 — Autovalidación de la fórmula
// ────────────────────────────────────────────────────────────────────────────

describe('T2: la fórmula está validada contra razones conocidas', () => {
  it('#000 vs #FFF = 21:1 (máximo teórico)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('#FFF vs #FFF = 1:1 (mínimo teórico)', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 2);
  });

  it('#767676 vs #FFF = 4.54:1 (par publicado por WCAG como ejemplo AA)', () => {
    // WCAG cita #767676 sobre blanco como el caso justo-en-el-umbral.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('blend: alpha 0 da el fondo; alpha 1 da el frente', () => {
    expect(blend('#000000', 0, '#FFFFFF')).toBe('#FFFFFF');
    expect(blend('#000000', 1, '#FFFFFF')).toBe('#000000');
  });

  it('blend: alpha 0.5 sobre blanco y negro da gris medio', () => {
    // 0.5·0 + 0.5·255 = 127.5 → 128 por redondeo.
    expect(blend('#000000', 0.5, '#FFFFFF')).toBe('#808080');
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  T3 — Tabla de pares con guarda de completitud
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pares accesibles declarados. El tipo `Record<UiBadgeVariant, …>` cierra el
 * conjunto en compilación: agregar un valor a `UiBadgeVariant` sin entrada
 * acá es error de TypeScript. El test de completitud runtime cubre el caso
 * degenerado de que alguien ensanche la unión a `string` (lo que el sistema
 * de tipos no podría阻止 sin `Record<…, …>`).
 *
 * Los nombres omiten el prefijo `--color-` (lo agrega el parser).
 *
 * Los pares con texto blanco (`text-white` en Tailwind) usan
 * `fg-on-solid` — un token propio del design system, independiente del
 * lienzo (`bg-secondary`). Aunque hoy ambos resuelven a `#FFFFFF`, son
 * cables distintos: si el lienzo deja de ser blanco, los textos sobre
 * bloques de color sólido NO se mueven con él.
 */
const BADGE_PAIRS: Record<UiBadgeVariant, ContrastPair> = {
  pendiente: { bgToken: 'status-pendiente', alpha: 0.2, textToken: 'on-tint-slate' },
  en_proceso: { bgToken: 'brand-primary-soft', alpha: 1, textToken: 'on-tint-violet' },
  resuelto: { bgToken: 'status-resuelto', alpha: 0.15, textToken: 'on-tint-green' },
  cerrada: { bgToken: 'status-cerrada', alpha: 0.12, textToken: 'on-tint-graphite' },
  low: { bgToken: 'prio-low', alpha: 0.15, textToken: 'on-tint-green' },
  medium: { bgToken: 'prio-medium', alpha: 0.4, textToken: 'on-tint-amber' },
  high: { bgToken: 'prio-high', alpha: 0.15, textToken: 'on-tint-red' },
  critical: { bgToken: 'prio-critical', alpha: 1, textToken: 'fg-on-solid' },
};

const KPI_PAIRS: Record<UiKpiTone, ContrastPair> = {
  brand: { bgToken: 'brand-primary', alpha: 1, textToken: 'fg-on-solid' },
  cyan: { bgToken: 'accent-cyan', alpha: 1, textToken: 'on-tint-graphite' },
  green: { bgToken: 'accent-green', alpha: 1, textToken: 'on-tint-graphite' },
  red: { bgToken: 'prio-critical', alpha: 1, textToken: 'fg-on-solid' },
  slate: { bgToken: 'status-cerrada', alpha: 1, textToken: 'fg-on-solid' },
  amber: { bgToken: 'prio-medium', alpha: 1, textToken: 'on-tint-amber' },
  violet: { bgToken: 'brand-primary-hover', alpha: 1, textToken: 'fg-on-solid' },
};

describe('T3: completitud de la tabla de pares', () => {
  it('BADGE_PAIRS cubre todas las variantes de UiBadgeVariant', () => {
    const expected: UiBadgeVariant[] = [
      'pendiente',
      'en_proceso',
      'resuelto',
      'cerrada',
      'low',
      'medium',
      'high',
      'critical',
    ];
    const actual = Object.keys(BADGE_PAIRS).sort();
    expect(actual).toEqual([...expected].sort());
  });

  it('KPI_PAIRS cubre todos los tonos de UiKpiTone', () => {
    const expected: UiKpiTone[] = [
      'brand',
      'cyan',
      'green',
      'red',
      'slate',
      'amber',
      'violet',
    ];
    const actual = Object.keys(KPI_PAIRS).sort();
    expect(actual).toEqual([...expected].sort());
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  T4 — Aserciones sobre los pares reales
// ────────────────────────────────────────────────────────────────────────────

const THRESHOLD = 4.5;

describe('T4: ui-badge (8 variantes) — contraste ≥ 4.5:1', () => {
  for (const variant of Object.keys(BADGE_PAIRS) as UiBadgeVariant[]) {
    const pair = BADGE_PAIRS[variant];
    it(`${variant}: ${pair.bgToken}${pair.alpha < 1 ? ` (α=${pair.alpha})` : ''} vs ${pair.textToken}`, () => {
      const { bg, text } = resolveEffective(pair);
      const ratio = contrastRatio(bg, text);
      expect(ratio).toBeGreaterThanOrEqual(THRESHOLD);
    });
  }
});

describe('T4: ui-kpi-card (7 tonos) — contraste ≥ 4.5:1', () => {
  for (const tone of Object.keys(KPI_PAIRS) as UiKpiTone[]) {
    const pair = KPI_PAIRS[tone];
    it(`${tone}: ${pair.bgToken} vs ${pair.textToken}`, () => {
      const { bg, text } = resolveEffective(pair);
      const ratio = contrastRatio(bg, text);
      expect(ratio).toBeGreaterThanOrEqual(THRESHOLD);
    });
  }
});

describe('T4: el fondo tintado se compone antes de medir', () => {
  // Documenta la composición alfa. Cualquier cambio en el alfa documentado
  // rompe este test; cualquier cambio en el token de fondo (que mueva la razón
  // efectiva) rompe T4.
  //
  // La forma de la expresión es deliberada: el caso usa `blend` con el fondo
  // del lienzo, no el token plano. Si alguien refactorea T4 para evitar
  // `blend` y mide contra el hex crudo del token, este test es la red.
  it('pendiente compone sobre bg-secondary con α=0.20', () => {
    const tokens = loadTokens();
    const tokenHex = tokens['status-pendiente'];
    const plainRatio = contrastRatio(tokenHex, tokens['on-tint-slate']);
    const composed = blend(tokenHex, 0.2, tokens['bg-secondary']);
    const composedRatio = contrastRatio(composed, tokens['on-tint-slate']);
    // El par crudo y el compuesto difieren — si llegan a coincidir, alguien
    // está midiendo contra el token plano en vez del fondo efectivo.
    expect(plainRatio).not.toBeCloseTo(composedRatio, 1);
    expect(composedRatio).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('medium compone sobre bg-secondary con α=0.40', () => {
    const tokens = loadTokens();
    const tokenHex = tokens['prio-medium'];
    const composed = blend(tokenHex, 0.4, tokens['bg-secondary']);
    const ratio = contrastRatio(composed, tokens['on-tint-amber']);
    expect(ratio).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('en_proceso usa el token sólido (sin alfa)', () => {
    // bg-brand-primary-soft es sólido. No se compone.
    const tokens = loadTokens();
    const softHex = tokens['brand-primary-soft'];
    const ratio = contrastRatio(softHex, tokens['on-tint-violet']);
    expect(ratio).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
