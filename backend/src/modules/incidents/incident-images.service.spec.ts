import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { IncidentImagesService } from './incident-images.service';
import { IncidentImageStorageService, MulterFile } from './incident-image-storage.service';
import { IncidentImageEntity } from './entities/incident-image.entity';
import { IncidentReporterEntity } from './entities/incident-reporters.entity';
import { IncidentsRepository } from './incidents.repository';
import { PermissionLookupService } from '../../shared/permissions/permission-lookup.service';
import { STORAGE_CLIENT } from '../../infra/storage/storage-client.interface';

const makeFile = (mime = 'image/jpeg'): MulterFile => ({
  originalname: 'photo.jpg',
  mimetype: mime,
  buffer: Buffer.from('fake'),
  size: 1024,
  fieldname: 'images',
  encoding: '7bit',
});

const makeIncident = (citizenId = 'user-1') => ({
  id: 'inc-1',
  citizen_id: citizenId,
  status: 'open',
  title: 'test',
  description: '',
  lat: 0,
  lng: 0,
  category_id: 'cat-1',
  location_id: null,
  organization_id: null,
  claimed_at: null,
  resolution_date: null,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeSavedImage = (overrides: Partial<IncidentImageEntity> = {}): IncidentImageEntity => ({
  id: 'img-1',
  incidentId: 'inc-1',
  // 2026-10-06-incident-images-read-path (D3) — `url` removed from
  // the entity; the byte route is the only resolution path. The
  // storage client's `upload()` still returns a URL (interface
  // contract — `StorageUploadResult`), but the service no longer
  // persists it.
  storageKey: 'incidents/inc-1/uuid-photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('IncidentImagesService', () => {
  let service: IncidentImagesService;
  let imageRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let storage: { upload: jest.Mock; delete: jest.Mock };
  let incidentsRepository: { findOne: jest.Mock };
  // AUD (sc-327) D6 / sc-419 — el service ahora consulta
  // `incident_reporters` por PK-only probe para reconocer al
  // autor real de un reporte anónimo. Default `false`: cuando
  // el test no lo piense, el reporter anónimo no está en la
  // tabla y `isReporter` es falso (consistente con los tests
  // existentes que no tocaban este código).
  let reporterRepo: { exists: jest.Mock };
  // F6 fix (post-0051): el service inyecta `PermissionLookupService`.
  // Stub devuelve `"ACTION resource"` (mismo string que los tests
  // usan en `callerPermissions`) para mantener los asserts de auth
  // exactamente como estaban antes del fix.
  let permissionLookup: { getUuid: jest.Mock; invalidate: jest.Mock };
  // 2026-10-06-incident-images-read-path (D4) — the service now
  // also injects STORAGE_CLIENT to call `getSignedUrl` for the byte
  // route. Lifted to describe scope so nested describe blocks
  // (`getImageFile`) can read it through closure (the previous
  // `const` inside `beforeEach` was not visible to nested
  // describe's `it()` blocks under ts-jest strict-mode checking).
  let storageClient: { upload: jest.Mock; getSignedUrl: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    imageRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    storage = {
      upload: jest.fn(),
      delete: jest.fn(),
    };
    incidentsRepository = {
      findOne: jest.fn(),
    };
    reporterRepo = {
      exists: jest.fn().mockResolvedValue(false),
    };
    permissionLookup = {
      getUuid: jest.fn().mockImplementation(async (action: string, resource: string) => {
        return `${action} ${resource}`;
      }),
      invalidate: jest.fn(),
    };
    // 2026-10-06-incident-images-read-path (D4) — the service now
    // also injects STORAGE_CLIENT to call `getSignedUrl` for the byte
    // route. Stub returns a `file://` URL by default (noop behavior).
    storageClient = {
      upload: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('file:///dev/null/test.webp'),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentImagesService,
        { provide: getRepositoryToken(IncidentImageEntity), useValue: imageRepo },
        { provide: getRepositoryToken(IncidentReporterEntity), useValue: reporterRepo },
        { provide: IncidentImageStorageService, useValue: storage },
        { provide: STORAGE_CLIENT, useValue: storageClient },
        { provide: IncidentsRepository, useValue: incidentsRepository },
        { provide: PermissionLookupService, useValue: permissionLookup },
      ],
    }).compile();

    service = module.get<IncidentImagesService>(IncidentImagesService);
  });

  describe('listForIncident()', () => {
    it('returns images for an incident in scope', async () => {
      incidentsRepository.findOne.mockResolvedValue(makeIncident());
      const image = makeSavedImage();
      imageRepo.find.mockResolvedValue([image]);

      const result = await service.listForIncident('inc-1', { kind: 'global' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('img-1');
      expect(incidentsRepository.findOne).toHaveBeenCalledWith('inc-1', { kind: 'global' });
      // 2026-10-06-incident-images-read-path S1 — design D3
      // mandates that the metadata list does NOT resolve signed
      // URLs. Regression guard: anyone who later adds URL
      // resolution to the list path will trip this assertion.
      expect(storageClient.getSignedUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when incident is not found or out of scope', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listForIncident('inc-1', { kind: 'org', organizationId: 'org-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachToIncident()', () => {
    it('uploads files and returns IncidentImageDto array for owner', async () => {
      const incident = makeIncident('user-1');
      const savedImage = makeSavedImage();
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.upload.mockResolvedValue({ key: savedImage.storageKey, url: 'https://storage.example.com/incidents/inc-1/uuid-photo.jpg?sig=abc' });
      imageRepo.create.mockReturnValue(savedImage);
      imageRepo.save.mockResolvedValue(savedImage);

      const result = await service.attachToIncident('inc-1', 'user-1', [], [makeFile()]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('img-1');
      // 2026-10-06-incident-images-read-path (D3) — DTO no longer
      // carries `url`. The frontend resolves bytes via the byte
      // route; the metadata list only carries id, mime_type,
      // file_size, created_at.
      expect(result[0]).not.toHaveProperty('url');
      expect(result[0].mime_type).toBe('image/jpeg');
    });

    it('uploads for user with CREATE incident-images permission (not owner)', async () => {
      const incident = makeIncident('other-user');
      const savedImage = makeSavedImage();
      incidentsRepository.findOne.mockResolvedValue(incident);
      // 2026-10-06-incident-images-read-path (D3) — the storage
      // client still returns `{ key, url }`; the service drops the
      // URL from the persisted entity.
      storage.upload.mockResolvedValue({ key: savedImage.storageKey, url: 'https://storage.example.com/incidents/inc-1/uuid-photo.jpg?sig=abc' });
      imageRepo.create.mockReturnValue(savedImage);
      imageRepo.save.mockResolvedValue(savedImage);

      const result = await service.attachToIncident('inc-1', 'user-1', ['CREATE incident-images'], [makeFile()]);

      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException when incident not found', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);
      await expect(
        service.attachToIncident('inc-1', 'user-1', [], [makeFile()]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // AUD (sc-327) D6 / sc-419 — el autor real de un
    // reporte anónimo es reconocido vía `incident_reporters`
    // aunque `incidents.citizen_id` apunte a la máscara. Sin
    // este chequeo, el flujo "Anónimo → subir fotos"
    // devuelve 403. PK-only probe: el mock asserta los
    // argumentos para que el contrato no se deforme.
    it('uploads for the real author of an anonymously-reported incident (present in incident_reporters)', async () => {
      const incident = makeIncident('mask-user');
      const savedImage = makeSavedImage();
      incidentsRepository.findOne.mockResolvedValue(incident);
      reporterRepo.exists.mockResolvedValueOnce(true);
      storage.upload.mockResolvedValue({ key: savedImage.storageKey, url: 'https://storage.example.com/incidents/inc-1/uuid-photo.jpg?sig=abc' });
      imageRepo.create.mockReturnValue(savedImage);
      imageRepo.save.mockResolvedValue(savedImage);

      const result = await service.attachToIncident('inc-1', 'real-author', [], [makeFile()]);

      expect(result).toHaveLength(1);
      expect(reporterRepo.exists).toHaveBeenCalledWith({
        where: { incidentId: 'inc-1', userId: 'real-author' },
      });
    });

    it('throws ForbiddenException when caller is not owner, not in incident_reporters, and lacks permission', async () => {
      const incident = makeIncident('other-user');
      incidentsRepository.findOne.mockResolvedValue(incident);
      reporterRepo.exists.mockResolvedValueOnce(false);
      await expect(
        service.attachToIncident('inc-1', 'caller', [], [makeFile()]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reporterRepo.exists).toHaveBeenCalledWith({
        where: { incidentId: 'inc-1', userId: 'caller' },
      });
    });

    it('throws ForbiddenException when caller is not owner and lacks permission', async () => {
      const incident = makeIncident('other-user');
      incidentsRepository.findOne.mockResolvedValue(incident);
      await expect(
        service.attachToIncident('inc-1', 'caller', [], [makeFile()]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws UnprocessableEntityException for disallowed MIME type', async () => {
      const incident = makeIncident('user-1');
      incidentsRepository.findOne.mockResolvedValue(incident);
      await expect(
        service.attachToIncident('inc-1', 'user-1', [], [makeFile('application/pdf')]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('removeFromIncident()', () => {
    it('deletes the image for owner', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('user-1');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.delete.mockResolvedValue(undefined);
      imageRepo.delete.mockResolvedValue({ affected: 1 });

      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'user-1', []),
      ).resolves.toBeUndefined();
      expect(imageRepo.delete).toHaveBeenCalledWith({ id: 'img-1' });
    });

    it('deletes the image for user with DELETE incident-images permission', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('other-user');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.delete.mockResolvedValue(undefined);
      imageRepo.delete.mockResolvedValue({ affected: 1 });

      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'caller', ['DELETE incident-images']),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when image not found', async () => {
      imageRepo.findOne.mockResolvedValue(null);
      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'user-1', []),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when image belongs to different incident', async () => {
      const image = makeSavedImage({ incidentId: 'different-inc' });
      imageRepo.findOne.mockResolvedValue(image);
      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'user-1', []),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when caller is not owner and lacks permission', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('other-user');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'caller', []),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // AUD (sc-327) D6 / sc-419 — espejo simétrico del upload:
    // el autor real de un reporte anónimo debe poder borrar
    // fotos de su propia publicación sin tener permiso global.
    it('deletes the image for the real author of an anonymously-reported incident (present in incident_reporters)', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('mask-user');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      reporterRepo.exists.mockResolvedValueOnce(true);
      storage.delete.mockResolvedValue(undefined);
      imageRepo.delete.mockResolvedValue({ affected: 1 });

      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'real-author', []),
      ).resolves.toBeUndefined();
      expect(imageRepo.delete).toHaveBeenCalledWith({ id: 'img-1' });
      expect(reporterRepo.exists).toHaveBeenCalledWith({
        where: { incidentId: 'inc-1', userId: 'real-author' },
      });
    });

    it('throws ForbiddenException when caller is not owner, not in incident_reporters, and lacks permission (delete path)', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('other-user');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      reporterRepo.exists.mockResolvedValueOnce(false);
      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'caller', []),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reporterRepo.exists).toHaveBeenCalledWith({
        where: { incidentId: 'inc-1', userId: 'caller' },
      });
    });

    it('warns but does not throw when S3 delete fails', async () => {
      const image = makeSavedImage();
      const incident = makeIncident('user-1');
      imageRepo.findOne.mockResolvedValue(image);
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.delete.mockRejectedValue(new Error('S3 unavailable'));
      imageRepo.delete.mockResolvedValue({ affected: 1 });

      // Should still resolve (graceful degradation)
      await expect(
        service.removeFromIncident('inc-1', 'img-1', 'user-1', []),
      ).resolves.toBeUndefined();
      expect(imageRepo.delete).toHaveBeenCalledWith({ id: 'img-1' });
    });
  });

  // 2026-10-06-incident-images-read-path (fixes-required W3) —
  // direct service-layer coverage for `getImageFile()`. The
  // controller spec exercises it via mock, but the service owns the
  // authorization boundary (`image.incidentId === id` → 404 on
  // mismatch) and the `file://` vs `http(s)` dispatch — both must
  // be unit-tested at this layer.
  describe('getImageFile()', () => {
    it('throws NotFoundException when image does not belong to the given incident (auth boundary)', async () => {
      // The service refuses to leak existence across incidents —
      // it returns the same 404 whether the image belongs to a
      // different incident or doesn't exist at all.
      imageRepo.findOne.mockResolvedValueOnce({
        ...makeSavedImage(),
        incidentId: 'other-incident',
      });

      await expect(service.getImageFile('inc-1', 'img-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // Storage client MUST NOT be called when the boundary rejects.
      expect(storageClient.getSignedUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the image does not exist', async () => {
      imageRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getImageFile('inc-1', 'img-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storageClient.getSignedUrl).not.toHaveBeenCalled();
    });

    it('returns stream result when getSignedUrl returns a file:// URL (noop / local dev)', async () => {
      // The noop client returns `file:///abs/path.webp` — the
      // service detects the scheme and pipes the bytes through
      // `StreamableFile`. We don't actually create a file on disk;
      // the production code path uses `fileURLToPath` + `createReadStream`,
      // and we assert the contract that the service hands back a
      // `StreamableFile` (the file path resolves at runtime, not
      // in unit tests).
      const image = makeSavedImage();
      imageRepo.findOne.mockResolvedValueOnce(image);
      storageClient.getSignedUrl.mockResolvedValueOnce('file:///tmp/test.webp');

      const result = await service.getImageFile('inc-1', 'img-1');

      expect(result.kind).toBe('stream');
      if (result.kind === 'stream') {
        expect(result.mimeType).toBe('image/jpeg');
        expect(result.file).toBeInstanceOf(StreamableFile);
      }
    });

    it('returns redirect result when getSignedUrl returns an http(s) URL (Supabase in production)', async () => {
      const image = makeSavedImage();
      imageRepo.findOne.mockResolvedValueOnce(image);
      const signedUrl =
        'https://supabase.example.co/storage/v1/object/sign/bucket/incidents/inc-1/uuid.webp?token=abc';
      storageClient.getSignedUrl.mockResolvedValueOnce(signedUrl);

      const result = await service.getImageFile('inc-1', 'img-1');

      expect(result.kind).toBe('redirect');
      if (result.kind === 'redirect') {
        expect(result.url).toBe(signedUrl);
        expect(result.mimeType).toBe('image/jpeg');
      }
    });
  });
});
