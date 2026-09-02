import { render, screen } from '@testing-library/angular';
import { StatusBadgeComponent } from './status-badge.component';

/**
 * F0.4.7 — `app-status-badge` envuelve `ui-badge` (D6) traduciendo
 * estado de dominio a variante del primitivo compartido.
 *
 * **Trampa documentada** (WARNING-6 de `fixes-required.md`): el mapeo
 * `TONE_TO_VARIANT.danger = 'cerrada'` es semánticamente dudoso — `danger`
 * connota rojo/error y `cerrada` renderiza `bg-slate-800` (grafito).
 * No hay consumidores activos de `customTone` en el árbol
 * (`grep -rn customTone src/app` solo encuentra este spec), así que no
 * es una regresión visible. **No lo cambio acá**: es decisión de
 * Gemini (semántica de dominio, no refactor). El test captura el
 * comportamiento actual explícitamente para que un cambio accidental
 * se note, y un comentario señala dónde está la discusión.
 */

describe('StatusBadgeComponent', () => {
  it('falls back to variant "pendiente" when called with no inputs', async () => {
    // Sin status ni customLabel ni customTone, el `variant()` computed de
    // `StatusBadgeComponent` cae al `return 'pendiente'` del `switch`.
    // Luego `ui-badge` recibe variant="pendiente" sin label explícito y
    // muestra el nombre del variant. Esto documenta la cadena de fallback
    // completa: en la práctica, un consumidor siempre debe pasar
    // `status` o `customLabel`.
    await render(`<app-status-badge />`, { imports: [StatusBadgeComponent] });
    const wrapper = document.querySelector('[data-variant]');
    expect(wrapper?.getAttribute('data-variant')).toBe('pendiente');
  });

  it('shows the humanized status as label by default', async () => {
    await render(`<app-status-badge status="EN_PROCESO" />`, {
      imports: [StatusBadgeComponent],
    });
    expect(screen.getByText('EN PROCESO')).toBeTruthy();
  });

  it('replaces underscores with spaces in the default label', async () => {
    await render(`<app-status-badge status="REQUIRES_REVIEW" />`, {
      imports: [StatusBadgeComponent],
    });
    expect(screen.getByText('REQUIRES REVIEW')).toBeTruthy();
  });

  it('customLabel overrides the default label', async () => {
    await render(
      `<app-status-badge status="EN_PROCESO" customLabel="En curso" />`,
      { imports: [StatusBadgeComponent] },
    );
    expect(screen.getByText('En curso')).toBeTruthy();
    expect(screen.queryByText('EN PROCESO')).toBeNull();
  });

  // Mapeo de estados de dominio → variantes de ui-badge (D6).
  it.each<[string, string]>([
    ['REGISTRADO', 'resuelto'],
    ['ACTIVO', 'resuelto'],
    ['PAGADO', 'resuelto'],
    ['APROBADO', 'resuelto'],
    ['EXITOSO', 'resuelto'],
    ['RESUELTO', 'resuelto'],
    ['COMPLETADA', 'resuelto'],
    ['PENDIENTE', 'en_proceso'],
    ['IN_REVIEW', 'en_proceso'],
    ['EN_PROCESO', 'en_proceso'],
    ['PARCIAL', 'en_proceso'],
    ['CON_NOVEDAD', 'en_proceso'],
    ['POR_REVISION', 'en_proceso'],
    ['ANULADO', 'cerrada'],
    ['INACTIVO', 'cerrada'],
    ['RECHAZADO', 'cerrada'],
    ['CANCELADA', 'cerrada'],
    ['GENERADO', 'pendiente'],
    ['NUEVA', 'pendiente'],
    ['TOMADA', 'pendiente'],
  ])('maps status "%s" to ui-badge variant "%s"', async (status, expectedVariant) => {
    await render(`<app-status-badge status="${status}" />`, {
      imports: [StatusBadgeComponent],
    });
    const wrapper = document.querySelector('[data-variant]');
    expect(wrapper?.getAttribute('data-variant')).toBe(expectedVariant);
  });

  it('falls back to "pendiente" for an unknown status', async () => {
    await render(`<app-status-badge status="UNKNOWN_THING" />`, {
      imports: [StatusBadgeComponent],
    });
    const wrapper = document.querySelector('[data-variant]');
    expect(wrapper?.getAttribute('data-variant')).toBe('pendiente');
  });

  // customTone → TONE_TO_VARIANT (mapa legacy preservado por F0.4.7).
  // ⚠️ Ver WARNING-6 en `fixes-required.md`: el mapeo `danger → cerrada`
  // es semánticamente dudoso y espera decisión de Gemini. Este test
  // documenta el comportamiento actual explícitamente para que un
  // cambio accidental (sin ticket) lo haga visible.
  it.each<[string, string]>([
    ['success', 'resuelto'],
    ['warning', 'en_proceso'],
    ['primary', 'en_proceso'],
    ['info', 'pendiente'],
    ['secondary', 'pendiente'],
    // ⚠️ Trampa: danger→cerrada. Si Gemini decide moverlo a `high` o
    // `critical`, este test es el lugar que cambia — junto con el
    // comentario de arriba.
    ['danger', 'cerrada'],
  ])(
    'maps customTone "%s" to ui-badge variant "%s" (ver WARNING-6 sobre danger→cerrada)',
    async (tone, expectedVariant) => {
      await render(
        `<app-status-badge status="X" customTone="${tone}" />`,
        { imports: [StatusBadgeComponent] },
      );
      const wrapper = document.querySelector('[data-variant]');
      expect(wrapper?.getAttribute('data-variant')).toBe(expectedVariant);
    },
  );

  it('customTone wins over status-based mapping', async () => {
    // Aunque `RESUELTO` resuelve a `resuelto` por status, `customTone="warning"`
    // lo sobrescribe a `en_proceso`. Esto es la API pública que F0.4.7
    // preservó: el consumidor tiene la última palabra.
    await render(
      `<app-status-badge status="RESUELTO" customTone="warning" />`,
      { imports: [StatusBadgeComponent] },
    );
    const wrapper = document.querySelector('[data-variant]');
    expect(wrapper?.getAttribute('data-variant')).toBe('en_proceso');
  });

  it('renders the dot by default', async () => {
    const { container } = await render(
      `<app-status-badge status="EN_PROCESO" />`,
      { imports: [StatusBadgeComponent] },
    );
    // El dot es un span redondo dentro del badge. Con `dot=true` (default)
    // debe aparecer. Sin dot, no.
    const dot = container.querySelector('span.rounded-full.bg-current');
    expect(dot).toBeTruthy();
  });

  it('omits the dot when dot=false', async () => {
    const { container } = await render(
      `<app-status-badge status="EN_PROCESO" [dot]="false" />`,
      { imports: [StatusBadgeComponent] },
    );
    const dot = container.querySelector('span.rounded-full.bg-current');
    expect(dot).toBeNull();
  });
});
