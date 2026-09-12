import {
  IncidentImageStorageService,
  MulterFile,
} from './incident-image-storage.service';

function makeFile(name = 'photo.jpg', mime = 'image/jpeg'): MulterFile {
  return {
    originalname: name,
    mimetype: mime,
    buffer: Buffer.from('fake'),
    size: 4,
    fieldname: 'images',
    encoding: '7bit',
  };
}

describe('IncidentImageStorageService', () => {
  let service: IncidentImageStorageService;

  beforeEach(() => {
    service = new IncidentImageStorageService();
  });

  describe('upload', () => {
    it('generates a key with format incidents/{incidentId}/{uuid}-{sanitizedOriginalname}', async () => {
      const result = await service.upload('inc-123', makeFile('photo.jpg'));

      expect(result.key).toMatch(/^incidents\/inc-123\/.+-photo\.jpg$/);
    });

    it('sanitizes non-alphanumeric characters in originalname', async () => {
      const result = await service.upload('inc-123', makeFile('my photo (1).jpg'));

      expect(result.key).not.toContain(' ');
      expect(result.key).not.toContain('(');
      expect(result.key).not.toContain(')');
    });

    it('returns both key and a signed URL', async () => {
      const result = await service.upload('inc-123', makeFile('photo.jpg'));

      expect(result.key).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.url).toContain('https://storage.example.com');
      expect(result.url).toContain(result.key);
      expect(result.url).toContain('sig=');
    });

    it('a different incidentId produces a differently scoped key', async () => {
      const result = await service.upload('inc-xyz', makeFile());

      expect(result.key).toMatch(/^incidents\/inc-xyz\//);
    });

    it('generates unique keys for the same incidentId and filename', async () => {
      const result1 = await service.upload('inc-123', makeFile('photo.jpg'));
      const result2 = await service.upload('inc-123', makeFile('photo.jpg'));

      expect(result1.key).not.toEqual(result2.key);
    });
  });

  describe('getSignedUrl', () => {
    it('returns a signed URL with SHA-256 signature query parameter', () => {
      const url = service.getSignedUrl('incidents/inc-1/uuid-photo.jpg');

      expect(url).toContain('https://storage.example.com');
      expect(url).toContain('incidents/inc-1/uuid-photo.jpg');
      expect(url).toMatch(/sig=[a-f0-9]{16}$/);
    });

    it('generates different signatures for different keys', () => {
      const url1 = service.getSignedUrl('incidents/inc-1/uuid-photo.jpg');
      const url2 = service.getSignedUrl('incidents/inc-2/uuid-photo.jpg');

      expect(url1).not.toBe(url2);
    });
  });

  describe('delete', () => {
    it('is a no-op stub', async () => {
      await service.delete('incidents/inc-1/uuid-photo.jpg');
      // No error thrown
    });
  });
});
