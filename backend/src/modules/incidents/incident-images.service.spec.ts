import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { IncidentImagesService } from './incident-images.service';
import { IncidentImageStorageService, MulterFile } from './incident-image-storage.service';
import { IncidentImageEntity } from '../../entities/incident-image.entity';
import { IncidentsRepository } from './incidents.repository';

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
  storageKey: 'incidents/inc-1/uuid-photo.jpg',
  url: 'https://storage.example.com/incidents/inc-1/uuid-photo.jpg?sig=abc',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  createdAt: new Date(),
  ...overrides,
});

describe('IncidentImagesService', () => {
  let service: IncidentImagesService;
  let imageRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let storage: { upload: jest.Mock; delete: jest.Mock };
  let incidentsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    imageRepo = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentImagesService,
        { provide: getRepositoryToken(IncidentImageEntity), useValue: imageRepo },
        { provide: IncidentImageStorageService, useValue: storage },
        { provide: IncidentsRepository, useValue: incidentsRepository },
      ],
    }).compile();

    service = module.get<IncidentImagesService>(IncidentImagesService);
  });

  describe('attachToIncident()', () => {
    it('uploads files and returns IncidentImageDto array for owner', async () => {
      const incident = makeIncident('user-1');
      const savedImage = makeSavedImage();
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.upload.mockResolvedValue({ key: savedImage.storageKey, url: savedImage.url });
      imageRepo.create.mockReturnValue(savedImage);
      imageRepo.save.mockResolvedValue(savedImage);

      const result = await service.attachToIncident('inc-1', 'user-1', [], [makeFile()]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('img-1');
      expect(result[0].url).toBe(savedImage.url);
      expect(result[0].mime_type).toBe('image/jpeg');
    });

    it('uploads for user with CREATE incident-images permission (not owner)', async () => {
      const incident = makeIncident('other-user');
      const savedImage = makeSavedImage();
      incidentsRepository.findOne.mockResolvedValue(incident);
      storage.upload.mockResolvedValue({ key: savedImage.storageKey, url: savedImage.url });
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
});
