import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { SnakeCaseResponseInterceptor } from './snake-case-response.interceptor';

describe('SnakeCaseResponseInterceptor', () => {
  const interceptor = new SnakeCaseResponseInterceptor();
  const context = {} as ExecutionContext;

  function handlerReturning(body: unknown): CallHandler {
    return { handle: () => of(body) } as CallHandler;
  }

  async function intercept(body: unknown): Promise<unknown> {
    return firstValueFrom(interceptor.intercept(context, handlerReturning(body)));
  }

  it('converts a TypeORM entity response (the camelCase leak)', async () => {
    await expect(
      intercept({
        id: 'c-1',
        content: 'sigue bloqueado',
        incidentId: 'i-1',
        userId: 'u-1',
      }),
    ).resolves.toEqual({
      id: 'c-1',
      content: 'sigue bloqueado',
      incident_id: 'i-1',
      user_id: 'u-1',
    });
  });

  it('leaves a raw PostGIS row unchanged (already snake_case)', async () => {
    const incident = {
      id: 'i-1',
      citizen_id: 'u-1',
      zone_id: null,
      geofence_matched: false,
      lat: -2.2,
      lng: -80.5,
    };

    await expect(intercept(incident)).resolves.toEqual(incident);
  });

  it('converts every element of a list response', async () => {
    await expect(intercept([{ incidentId: 'i-1' }, { incidentId: 'i-2' }])).resolves.toEqual([
      { incident_id: 'i-1' },
      { incident_id: 'i-2' },
    ]);
  });

  // Permission strings are values, not keys — rewriting them would break
  // PermissionGuard, which compares against "ACTION resource" exactly.
  it('does not touch permission strings', async () => {
    await expect(
      intercept({ userId: 'u-1', permissions: ['READ incidents', 'CREATE comments'] }),
    ).resolves.toEqual({
      user_id: 'u-1',
      permissions: ['READ incidents', 'CREATE comments'],
    });
  });

  it('keeps token fields intact', async () => {
    await expect(
      intercept({ access_token: 'a.b.c', refresh_token: 'd.e.f' }),
    ).resolves.toEqual({ access_token: 'a.b.c', refresh_token: 'd.e.f' });
  });

  it('preserves Date instances so timestamps still serialize', async () => {
    const createdAt = new Date('2026-08-15T16:30:17.435Z');

    const result = (await intercept({ createdAt })) as { created_at: Date };

    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('passes an empty body through untouched', async () => {
    await expect(intercept(undefined)).resolves.toBeUndefined();
  });
});
