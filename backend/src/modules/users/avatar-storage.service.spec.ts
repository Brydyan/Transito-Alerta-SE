import { FileTooLargeError } from '../../core/image/compression-error.exception';
import { ImageCompressionService } from '../../core/image/image-compression.service';
import { IStorageClient } from '../../core/storage/storage-client.interface';
import { AvatarStorageService } from './avatar-storage.service';

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

function makeCompressionMock(): jest.Mocked<ImageCompressionService> {
  return {
    compress: jest.fn(),
  } as unknown as jest.Mocked<ImageCompressionService>;
}

describe('AvatarStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let compression: jest.Mocked<ImageCompressionService>;
  let service: AvatarStorageService;

  beforeEach(() => {
    client = makeClientMock();
    compression = makeCompressionMock();
    service = new AvatarStorageService(client, compression);
  });

  describe('upload (F7 image-compression-webp, T3.1/T3.2)', () => {
    it('calls imageCompression.compress() with type=avatar BEFORE delegating to client.upload', async () => {
      const compressed = Buffer.from('webp-bytes');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 85,
        originalSizeKb: 35000,
        ratio: 412,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'ignored',
        url: 'https://real.example/avatars/u1/photo.webp',
      });

      const callOrder: string[] = [];
      compression.compress.mockImplementation(async () => {
        callOrder.push('compress');
        return {
          buffer: compressed,
          sizeKb: 85,
          originalSizeKb: 35000,
          ratio: 412,
          mimetype: 'image/webp',
        };
      });
      client.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return { key: 'ignored', url: 'https://real.example/x' };
      });

      await service.upload('u1', {
        buffer: Buffer.from('original-jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      expect(callOrder).toEqual(['compress', 'upload']);
    });

    it('passes the compressed WebP buffer + image/webp mimetype to client.upload (NOT the original mimetype)', async () => {
      const compressed = Buffer.from('webp-bytes');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 85,
        originalSizeKb: 35000,
        ratio: 412,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/u1/photo.webp' });

      await service.upload('u1', {
        buffer: Buffer.from('original'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      expect(client.upload).toHaveBeenCalledTimes(1);
      const [key, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(compressed);
      expect(mimetype).toBe('image/webp');
      expect(key).toMatch(/^avatars\/u1\/.+\.webp$/);
    });

    it('keys the object as avatars/{userId}/{uuid}.webp (extension always .webp, originalname dropped)', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/x' });

      await service.upload('u1', {
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        originalname: 'crazy name with spaces.png',
      });

      const [key] = client.upload.mock.calls[0];
      // Strict: NO original name fragment in the key, only the .webp suffix.
      expect(key).toMatch(/^avatars\/u1\/.+\.webp$/);
      expect(key).not.toContain('crazy');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('png');
    });

    it('returns the url resolved by the injected IStorageClient', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'ignored',
        url: 'https://real.example/avatars/u1/uuid.webp',
      });

      const url = await service.upload('u1', {
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      expect(url).toBe('https://real.example/avatars/u1/uuid.webp');
    });

    it('forwards buffer and mimetype to the compression service verbatim', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('compressed'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/x' });

      const originalBuffer = Buffer.from('orig');
      await service.upload('u1', {
        buffer: originalBuffer,
        mimetype: 'image/png',
        originalname: 'photo.png',
      });

      expect(compression.compress).toHaveBeenCalledWith(
        originalBuffer,
        'avatar',
        'image/png',
      );
    });

    it('propagates FileTooLargeError from compression (sharp NOT protected here — service is the boundary)', async () => {
      const err = new FileTooLargeError(150 * 1024);
      compression.compress.mockRejectedValue(err);

      await expect(
        service.upload('u1', {
          buffer: Buffer.from('x'),
          mimetype: 'image/jpeg',
          originalname: 'p.jpg',
        }),
      ).rejects.toBe(err);

      // The whole point of rejecting here is to STOP — client.upload
      // must not have been called.
      expect(client.upload).not.toHaveBeenCalled();
    });

    it('a different userId/file produces a differently scoped .webp key (triangulation)', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/x' });

      await service.upload('u2', {
        buffer: Buffer.from('y'),
        mimetype: 'image/jpeg',
        originalname: 'pic.jpg',
      });

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^avatars\/u2\/.+\.webp$/);
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed-avatar');

      const url = await service.getSignedUrl('avatars/u1/x.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith('avatars/u1/x.webp');
      expect(url).toBe('https://real.example/signed-avatar');
    });
  });
});
