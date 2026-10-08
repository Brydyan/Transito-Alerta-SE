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
  let imageCompression: jest.Mocked<ImageCompressionService>;
  let service: AvatarStorageService;

  beforeEach(() => {
    client = makeClientMock();
    imageCompression = makeCompressionMock();
    service = new AvatarStorageService(client, imageCompression);
  });

  describe('upload', () => {
    it('generates a key with format avatars/{userId}/{uuid}.webp (F7)', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'avatars/u1/abc.webp',
        url: 'https://real.example/avatars/u1/abc.webp',
      });

      const result = await service.upload('u1', {
        buffer: Buffer.from('original'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      expect(result).toBe('https://real.example/avatars/u1/abc.webp');
      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^avatars\/u1\/.+\.webp$/);
    });

    it('calls imageCompression.compress with the avatar type and original mimetype', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'avatars/u1/abc.webp',
        url: 'https://real.example/avatars/u1/abc.webp',
      });

      const originalBuffer = Buffer.from('orig');
      await service.upload('u1', {
        buffer: originalBuffer,
        mimetype: 'image/png',
        originalname: 'photo.png',
      });

      expect(imageCompression.compress).toHaveBeenCalledWith(
        originalBuffer,
        'avatar',
        'image/png',
      );
    });

    it('passes the compressed WebP buffer and image/webp MIME to client.upload (R8)', async () => {
      const webpBytes = Buffer.from('webp-bytes');
      imageCompression.compress.mockResolvedValue({
        buffer: webpBytes,
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'avatars/u1/abc.webp',
        url: 'https://real.example/avatars/u1/abc.webp',
      });

      await service.upload('u1', {
        buffer: Buffer.from('orig'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      const [key, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(webpBytes);
      expect(mimetype).toBe('image/webp');
      expect(key).toMatch(/^avatars\/u1\/.+\.webp$/);
    });

    it('a different userId produces a differently scoped key', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'avatars/u2/abc.webp',
        url: 'https://real.example/avatars/u2/abc.webp',
      });

      await service.upload('u2', {
        buffer: Buffer.from('y'),
        mimetype: 'image/jpeg',
        originalname: 'pic.jpg',
      });

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^avatars\/u2\//);
    });

    it('propagates compress() errors (FileTooLargeError) so HTTP gets 4xx', async () => {
      const { FileTooLargeError } = await import(
        '../../core/image/compression-error.exception'
      );
      const err = new FileTooLargeError(150_000);
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('u1', {
          buffer: Buffer.from('huge'),
          mimetype: 'image/jpeg',
          originalname: 'huge.jpg',
        }),
      ).rejects.toBeInstanceOf(FileTooLargeError);

      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates compress() errors (UnsupportedMimeType) so HTTP gets 415', async () => {
      const { UnsupportedMimeType } = await import(
        '../../core/image/compression-error.exception'
      );
      const err = new UnsupportedMimeType('image/bmp');
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('u1', {
          buffer: Buffer.from('bmp'),
          mimetype: 'image/bmp',
          originalname: 'bmp.bmp',
        }),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);

      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates compress() errors (CompressionSizeExceeded) so HTTP gets 4xx', async () => {
      const { CompressionSizeExceeded } = await import(
        '../../core/image/compression-error.exception'
      );
      const err = new CompressionSizeExceeded('avatar', 150, 100);
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('u1', {
          buffer: Buffer.from('hd'),
          mimetype: 'image/jpeg',
          originalname: 'hd.jpg',
        }),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);

      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates compress() errors (CompressionFailed) so HTTP gets 422', async () => {
      const { CompressionFailed } = await import(
        '../../core/image/compression-error.exception'
      );
      const err = new CompressionFailed(new Error('corrupt'));
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('u1', {
          buffer: Buffer.from('corrupt'),
          mimetype: 'image/jpeg',
          originalname: 'corrupt.jpg',
        }),
      ).rejects.toBeInstanceOf(CompressionFailed);

      expect(client.upload).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed-avatar');

      const url = await service.getSignedUrl('avatars/u1/abc.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith('avatars/u1/abc.webp');
      expect(url).toBe('https://real.example/signed-avatar');
    });
  });
});
