import { IStorageClient } from '../../core/storage/storage-client.interface';
import { AvatarStorageService } from './avatar-storage.service';

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe('AvatarStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let service: AvatarStorageService;

  beforeEach(() => {
    client = makeClientMock();
    service = new AvatarStorageService(client);
  });

  describe('upload', () => {
    it('generates a key with format avatars/{userId}/{uuid}-{originalname}', async () => {
      client.upload.mockResolvedValue({
        key: 'avatars/u1/uuid-photo.jpg',
        url: 'https://real.example/avatars/u1/uuid-photo.jpg',
      });

      const result = await service.upload('u1', {
        buffer: Buffer.from('original'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      expect(result).toBe('https://real.example/avatars/u1/uuid-photo.jpg');
      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^avatars\/u1\/.+-photo\.jpg$/);
    });

    it('delegates to the injected IStorageClient with the file buffer and mimetype', async () => {
      client.upload.mockResolvedValue({
        key: 'avatars/u1/uuid-photo.jpg',
        url: 'https://real.example/avatars/u1/uuid-photo.jpg',
      });

      const originalBuffer = Buffer.from('orig');
      await service.upload('u1', {
        buffer: originalBuffer,
        mimetype: 'image/png',
        originalname: 'photo.png',
      });

      const [key, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(originalBuffer);
      expect(mimetype).toBe('image/png');
      expect(key).toMatch(/^avatars\/u1\/.+-photo\.png$/);
    });

    it('a different userId produces a differently scoped key', async () => {
      client.upload.mockResolvedValue({
        key: 'avatars/u2/uuid-pic.jpg',
        url: 'https://real.example/avatars/u2/uuid-pic.jpg',
      });

      await service.upload('u2', {
        buffer: Buffer.from('y'),
        mimetype: 'image/jpeg',
        originalname: 'pic.jpg',
      });

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^avatars\/u2\//);
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed-avatar');

      const url = await service.getSignedUrl('avatars/u1/uuid-photo.jpg');

      expect(client.getSignedUrl).toHaveBeenCalledWith('avatars/u1/uuid-photo.jpg');
      expect(url).toBe('https://real.example/signed-avatar');
    });
  });
});
