import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CriticalIncidentListener } from './critical-incident.listener';
import { TelegramService } from '../telegram.service';

/**
 * F7 B.4.1 — non-critical priority MUST NOT enqueue any Telegram
 * message. F7 B.3 — only `admin_org` users of the incident's
 * organization with a `telegram_chat_id` are recipients. F7 B.3
 * edge cases (no org, no admins configured) MUST NOT fail.
 *
 * ── 2026-10-20: el payload es snake_case A PROPÓSITO ─────────────────────
 *
 * `IncidentsService.publish()` emite la fila cruda de la tabla
 * (`incidents.service.ts:170,268-271`), o sea snake_case. Una versión
 * anterior de este spec pasaba `{ incidentId, organizationId }` — camelCase
 * que el emisor nunca produjo — y por eso la suite estaba verde mientras el
 * listener salía por el guard de `!organizationId` en CADA incidente crítico
 * real. La alerta de Telegram no había funcioneado nunca.
 *
 * Estos fixtures son deliberadamente la forma real que sale de la DB. Si
 * alguien reintroduce camelCase aquí, el spec pasa y el bug vuelve: por eso
 * el e2e `dispatch-workflow.e2e-spec.ts`, que genera el payload por HTTP de
 * verdad, es la red que de verdad importa. El unit prueba la lógica; el e2e
 * prueba el contrato.
 */
describe('CriticalIncidentListener', () => {
  let dataSource: { query: jest.Mock };
  let telegram: { enqueue: jest.Mock };
  let configService: { get: jest.Mock };
  let listener: CriticalIncidentListener;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    telegram = { enqueue: jest.fn().mockResolvedValue('1-0') };
    configService = { get: jest.fn().mockReturnValue({ appBaseUrl: 'http://app.test' }) };
    listener = new CriticalIncidentListener(
      telegram as unknown as TelegramService,
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
    );
  });

  it('does NOT enqueue when priority is not critical (B.4.1)', async () => {
    await listener.onIncidentCreated({
      id: 'inc-1',
      title: 'Pothole',
      priority: 'high',
      organization_id: 'org-A',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when the incident has no organization (B.3 edge case)', async () => {
    await listener.onIncidentCreated({
      id: 'inc-1',
      title: 'Flood',
      priority: 'critical',
      organization_id: null,
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('does NOT fail when the organization has no admin_org with telegram_chat_id (B.3 edge case)', async () => {
    dataSource.query.mockResolvedValue([]);
    await listener.onIncidentCreated({
      id: 'inc-1',
      title: 'Flood',
      priority: 'critical',
      organization_id: 'org-A',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues one message per admin_org recipient with a chat_id (B.3 happy path)', async () => {
    dataSource.query.mockResolvedValue([
      { telegram_chat_id: '111' },
      { telegram_chat_id: '222' },
    ]);

    await listener.onIncidentCreated({
      id: 'inc-1',
      title: 'Fire on 5th',
      description: 'building 3, smoke visible',
      category_name: 'fire',
      priority: 'critical',
      organization_id: 'org-A',
      location: { lat: -2.1, lng: -79.9 },
    });

    expect(telegram.enqueue).toHaveBeenCalledTimes(2);
    const calls = telegram.enqueue.mock.calls;
    expect(calls[0][0].chat_id).toBe('111');
    expect(calls[0][0].text).toMatch(/EMERGENCIA/);
    expect(calls[0][0].text).toMatch(/Fire on 5th/);
    // 2026-10-20 — ruta real `/app/incidencias/:id`; la aserción fijaba la
    // ruta inexistente `/incidents/:id` (404 al tocar el link).
    expect(calls[0][0].text).toMatch(/Detalle: http:\/\/app\.test\/app\/incidencias\/inc-1/);
    expect(calls[0][0].text).not.toMatch(/app\.test\/incidents\//);
    expect(calls[1][0].chat_id).toBe('222');
  });
});
