import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';

import { IncidentImagesController } from './incident-images.controller';
import { IncidentImagesService } from './incident-images.service';
import { PermissionLookupService } from '../../shared/permissions/permission-lookup.service';
import { STORAGE_CLIENT } from '../../infra/storage/storage-client.interface';

/**
 * 2026-10-06-incident-images-read-path (D4) — covers the new
 * `GET /incidents/:id/images/:imageId/file` byte route.
 *
 * The controller delegates to `IncidentImagesService.getImageFile`,
 * which returns one of two shapes:
 *   - `{ kind: 'redirect', url, mimeType }` (Supabase in production)
 *   - `{ kind: 'stream', file: StreamableFile, mimeType }` (noop —
 *     local dev with `file://` URLs the browser would block)
 *
 * The 404 path is the authorization boundary — a caller who knows
 * an image UUID on another incident must NOT see it. Verified by
 * the `image.incidentId !== id` check in the service, exposed here
 * as a NotFoundException.
 */
describe('IncidentImagesController.getFile (2026-10-06-incident-images-read-path)', () => {
  let controller: IncidentImagesController;
  let service: { getImageFile: jest.Mock };

  beforeEach(async () => {
    service = { getImageFile: jest.fn() };
    // The mocked `IncidentImagesService` is the only thing the
    // controller touches at runtime, but Nest still wants every
    // constructor param of the type provider to be resolvable in
    // the testing module graph. `IncidentImagesService` itself
    // injects `PermissionLookupService` and `STORAGE_CLIENT`,
    // so we register noop stubs to satisfy the injector.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentImagesController],
      providers: [
        { provide: IncidentImagesService, useValue: service },
        {
          provide: PermissionLookupService,
          useValue: { getUuid: jest.fn(), invalidate: jest.fn() },
        },
        {
          provide: STORAGE_CLIENT,
          useValue: { upload: jest.fn(), getSignedUrl: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();
    controller = module.get<IncidentImagesController>(IncidentImagesController);
  });

  function makeRes(): Response {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      redirect: jest.fn().mockReturnThis(),
      headers,
    } as unknown as Response;
    return res;
  }

  it('streams the bytes when the provider returns a file:// URL (noop / local dev)', async () => {
    const stream = { pipe: jest.fn() };
    service.getImageFile.mockResolvedValue({
      kind: 'stream',
      file: stream,
      mimeType: 'image/webp',
    });

    const res = makeRes();
    const result = await controller.getFile('inc-1', 'img-1', res);

    expect(result).toBe(stream);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline');
    expect(res.redirect).not.toHaveBeenCalled();
    expect(service.getImageFile).toHaveBeenCalledWith('inc-1', 'img-1');
  });

  it('issues a 302 redirect when the provider returns an http(s) URL (Supabase in production)', async () => {
    service.getImageFile.mockResolvedValue({
      kind: 'redirect',
      url: 'https://supabase.example.co/storage/v1/object/sign/bucket/incidents/inc-1/uuid.webp?token=abc',
      mimeType: 'image/webp',
    });

    const res = makeRes();
    const result = await controller.getFile('inc-1', 'img-1', res);

    expect(result).toBeUndefined();
    expect(res.redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      expect.stringContaining('supabase.example.co'),
    );
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', expect.anything());
  });

  it('propagates NotFoundException from the service when the image is not on the incident', async () => {
    // Service enforces `image.incidentId === id` (D4 authorization).
    // Mismatched id ⇒ 404 without leaking existence.
    service.getImageFile.mockRejectedValue(new Error('Not Found'));
    const res = makeRes();

    await expect(controller.getFile('inc-1', 'wrong-img', res)).rejects.toThrow('Not Found');
  });

  it('forwards the incident id and image id verbatim to the service', async () => {
    service.getImageFile.mockResolvedValue({
      kind: 'stream',
      file: {},
      mimeType: 'image/png',
    });

    await controller.getFile('inc-uuid-a', 'img-uuid-b', makeRes());

    expect(service.getImageFile).toHaveBeenCalledTimes(1);
    expect(service.getImageFile).toHaveBeenCalledWith('inc-uuid-a', 'img-uuid-b');
  });
});