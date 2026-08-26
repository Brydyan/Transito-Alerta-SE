import { Test, TestingModule } from '@nestjs/testing';
import { IncidentImageStorageService } from './incident-image-storage.service';
import { MulterFile } from './incident-image-storage.service';

describe('IncidentImageStorageService', () => {
  let service: IncidentImageStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IncidentImageStorageService],
    }).compile();
    service = module.get<IncidentImageStorageService>(IncidentImageStorageService);
  });

  const makeFile = (name = 'photo.jpg', mime = 'image/jpeg'): MulterFile => ({
    originalname: name,
    mimetype: mime,
    buffer: Buffer.from('fake'),
    size: 4,
    fieldname: 'images',
    encoding: '7bit',
  });

  describe('upload()', () => {
    it('returns a key starting with incidents/{incidentId}/', async () => {
      const result = await service.upload('inc-123', makeFile());
      expect(result.key).toMatch(/^incidents\/inc-123\//);
    });

    it('sanitizes special characters in original filename', async () => {
      const result = await service.upload('inc-123', makeFile('my photo (1).jpg'));
      expect(result.key).not.toMatch(/[ ()]/);
    });

    it('returns a url string', async () => {
      const result = await service.upload('inc-123', makeFile());
      expect(typeof result.url).toBe('string');
      expect(result.url.length).toBeGreaterThan(0);
    });

    it('url matches getSignedUrl output for the generated key', async () => {
      const result = await service.upload('inc-abc', makeFile());
      const expectedUrl = service.getSignedUrl(result.key);
      expect(result.url).toBe(expectedUrl);
    });
  });

  describe('getSignedUrl()', () => {
    it('includes the key path in the url', () => {
      const url = service.getSignedUrl('incidents/inc-1/uuid-file.jpg');
      expect(url).toContain('incidents/inc-1/uuid-file.jpg');
    });

    it('appends a sig query param', () => {
      const url = service.getSignedUrl('some/key');
      expect(url).toContain('?sig=');
    });
  });

  describe('delete()', () => {
    it('resolves without throwing', async () => {
      await expect(service.delete('incidents/inc-1/some-key.jpg')).resolves.toBeUndefined();
    });
  });
});
