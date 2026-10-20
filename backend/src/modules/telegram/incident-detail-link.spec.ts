import { readFileSync } from 'fs';
import { join } from 'path';

import { INCIDENT_DETAIL_PATH, buildIncidentDetailLink } from './incident-detail-link';

/**
 * 2026-10-20 — regresión del enlace de Telegram roto.
 *
 * Tres call sites armaban el deep-link a mano como
 * `${appBaseUrl}/incidents/${incidentId}`. Esa ruta **no existe**: el árbol de
 * Angular es `path: 'app'` (tras `authGuard`) → `'incidencias'` → `':id'`, o
 * sea `/app/incidencias/:id`. Todos los mensajes de Telegram llevaban un 404.
 *
 * Peor: las specs de los listeners AFIRMABAN la ruta rota, así que el bug
 * estaba blindado por sus propios tests. Este archivo lo cambia de contrato a
 * contrato — el builder tiene UNA ruta, y un guard la cruza contra el router
 * real para que el próximo movimiento de rutas rompa la build en vez de
 * producción.
 */
describe('buildIncidentDetailLink', () => {
  it('apunta a la ruta real del detalle de incidencia', () => {
    expect(buildIncidentDetailLink('http://app.test', 'inc-1')).toBe(
      'http://app.test/app/incidencias/inc-1',
    );
  });

  it('NO produce la ruta rota /incidents/:id que sí se usó por error', () => {
    const link = buildIncidentDetailLink('http://app.test', 'inc-1');

    // El prefijo `/incidents/` a secas fue el bug; `/app/incidencias/` no debe
    // degenerar en él bajo ninguna configuración de base.
    expect(link).not.toBe('http://app.test/incidents/inc-1');
    expect(link).not.toContain('.test/incidents/');
  });

  it('preserva el esquema https y el subpath de un base url con path', () => {
    expect(buildIncidentDetailLink('https://tase-staging.tailc8cd10.ts.net', 'abc')).toBe(
      'https://tase-staging.tailc8cd10.ts.net/app/incidencias/abc',
    );
    expect(buildIncidentDetailLink('https://host/tase', 'abc')).toBe(
      'https://host/tase/app/incidencias/abc',
    );
  });

  it('elimina la barra final del base url para no duplicar separadores', () => {
    expect(buildIncidentDetailLink('https://host/', 'abc')).toBe(
      'https://host/app/incidencias/abc',
    );
    expect(buildIncidentDetailLink('https://host///', 'abc')).toBe(
      'https://host/app/incidencias/abc',
    );
    expect(buildIncidentDetailLink('https://host', 'abc')).not.toContain('//app');
  });

  it('tolera un appBaseUrl ausente sin lanzar', () => {
    // El listener usa `configService.get(...)!` — si la config no está, esto
    // devuelve undefined en runtime. No debe romperse el mensaje por eso.
    expect(() => buildIncidentDetailLink(undefined as unknown as string, 'abc')).not.toThrow();
  });
});

describe('guard de drift contra el router de Angular', () => {
  const ROUTES_FILE = join(
    __dirname,
    '../../../../frontend/src/app/app.routes.ts',
  );
  let routes: string;

  beforeAll(() => {
    routes = readFileSync(ROUTES_FILE, 'utf8');
  });

  it('la constante del builder coincide con el árbol de rutas real', () => {
    // Descomponer `/app/incidencias` en sus segmentos de ruta comprobables.
    const segments = INCIDENT_DETAIL_PATH.split('/').filter(Boolean);
    expect(segments).toEqual(['app', 'incidencias']);

    for (const segment of segments) {
      expect(routes).toContain(`path: '${segment}'`);
    }
  });

  it('el router sigue exponiendo el segment dinámico :id bajo incidencias', () => {
    // Sin el `:id` el deep-link abriría el listado, no el detalle.
    expect(routes).toMatch(/path:\s*'incidencias'[\s\S]*?path:\s*':id'/);
  });

  it('la ruta está detrás de un guard de autenticación (el returnUrl del login)', () => {
    // Requisito de D11: un operador sin sesión debe caer en /login y volver,
    // no en un 404 ni en una vista protegida que se renderiza vacía.
    const appRouteIndex = routes.indexOf("path: 'app'");
    expect(appRouteIndex).toBeGreaterThan(-1);

    const block = routes.slice(appRouteIndex, appRouteIndex + 400);
    expect(block).toMatch(/canActivate:\s*\[authGuard\]/);
  });
});