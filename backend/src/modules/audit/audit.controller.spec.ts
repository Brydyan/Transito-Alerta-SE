import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Readable } from 'stream';

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — controller spec.
 *
 * The controller is a thin shell: two GET handlers, both
 * guarded by `@RequirePermission('READ', 'audit-logs')`, one
 * returning a JSON body (interceptor converts to snake_case),
 * the other piping a `Readable` directly to the response with
 * `text/csv` and `Content-Disposition`.
 *
 * The 401/403 cases are NOT unit-tested here — those are the
 * guards' contract (JwtAuthGuard + PermissionGuard). Both
 * guards are well-covered in their own specs; re-implementing
 * them here would be asserting on a double, not on the system.
 * What the controller CAN assert on:
 *   - the metadata on each handler (RequirePermission)
 *   - the delegation to AuditService for `list`
 *   - the streaming behavior of `exportCsv` (Content-Type,
 *     Content-Disposition, body from the service)
 */
describe('AuditController (F6 audit-logs-export)', () => {
  let listMock: jest.Mock;
  let exportCsvMock: jest.Mock;
  let controller: AuditController;

  beforeEach(() => {
    listMock = jest.fn();
    exportCsvMock = jest.fn();
    controller = new AuditController({
      list: listMock,
      exportCsv: exportCsvMock,
    } as unknown as AuditService);
  });

  it('GET / declares READ audit-logs via RequirePermission', () => {
    // The PermissionGuard reads this metadata to decide whether
    // the caller's permissions array contains the matching UUID.
    // If the resource string drifts from `'audit-logs'`, the
    // guard resolves the WRONG UUID and rejects every master.
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.list);
    expect(meta).toEqual({ action: 'READ', resource: 'audit-logs' });
  });

  it('GET /export.csv declares READ audit-logs via RequirePermission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.exportCsv);
    expect(meta).toEqual({ action: 'READ', resource: 'audit-logs' });
  });

  it('GET / delegates to AuditService.list with the parsed filter DTO', async () => {
    listMock.mockResolvedValue({ items: [], total: 0 });

    const filters = {
      date_from: '2026-09-01T00:00:00Z',
      actor_id: 'user-1',
      action: 'REVEAL',
      resource_type: 'incidents',
      page: 1,
      limit: 20,
    };

    const result = await controller.list(filters);

    expect(listMock).toHaveBeenCalledWith(filters);
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('GET /export.csv sets Content-Type text/csv and Content-Disposition with audit-logs prefix', async () => {
    // The Readable is constructed by the service; here we hand
    // the controller a stream mock so the test asserts on the
    // pipe() call without re-implementing the export pipeline.
    const csv = {
      pipe: jest.fn().mockReturnThis(),
    } as unknown as Readable;
    exportCsvMock.mockReturnValue(csv);

    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const filters = { actor_id: 'user-1' };
    await controller.exportCsv(filters, res);

    // Content-Type: text/csv (spec scenario R3-S1 asserts
    // exactly this header).
    const headerCalls = setHeader.mock.calls;
    const ctCall = headerCalls.find((c) => c[0] === 'Content-Type');
    expect(ctCall?.[1]).toBe('text/csv; charset=utf-8');

    // Content-Disposition: attachment; filename="audit-logs-…csv"
    const cdCall = headerCalls.find((c) => c[0] === 'Content-Disposition');
    expect(cdCall?.[1]).toMatch(
      /^attachment; filename="audit-logs-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    expect(exportCsvMock).toHaveBeenCalledWith(filters);
    expect((csv as unknown as { pipe: jest.Mock }).pipe).toHaveBeenCalledWith(res);
  });

  it('GET /export.csv filename uses YYYY-MM-DD of the current date', async () => {
    // Verifies the date format used in the filename (so the
    // browser saves a predictable name).
    const csv = { pipe: jest.fn().mockReturnThis() } as unknown as Readable;
    exportCsvMock.mockReturnValue(csv);

    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    await controller.exportCsv({}, res);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const cdCall = setHeader.mock.calls.find((c) => c[0] === 'Content-Disposition');
    expect(cdCall?.[1]).toContain(`audit-logs-${today}.csv`);
  });
});
