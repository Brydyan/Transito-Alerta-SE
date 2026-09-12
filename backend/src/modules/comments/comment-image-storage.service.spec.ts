import {
  CompressionSizeExceeded,
  FileTooLargeError,
} from '../../core/image/compression-error.exception';
import { ImageCompressionService } from '../../core/image/image-compression.service';
import { IStorageClient } from '../../core/storage/storage-client.interface';
import {
  CommentImageStorageService,
  MulterFile,
} from './comment-image-storage.service';

function makeFile(originalname: string): MulterFile {
  return {
    originalname,
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.alloc(0),
    fieldname: 'images',
    encoding: '7bit',
  };
}

function makeCompressionMock(): jest.Mocked<ImageCompressionService> {
  return {
    compress: jest.fn(),
  } as unknown as jest.Mocked<ImageCompressionService>;
}

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe('CommentImageStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let compression: jest.Mocked<ImageCompressionService>;
  let service: CommentImageStorageService;

  beforeEach(() => {
    client = makeClientMock();
    compression = makeCompressionMock();
    service = new CommentImageStorageService(client, compression);
  });

  describe('upload (F7 image-compression-webp, T5.1/T5.2)', () => {
    it('compresses with type=comment before persisting', async () => {
      const compressed = Buffer.from('webp');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 200,
        originalSizeKb: 10000,
        ratio: 50,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'ignored',
        url: 'https://real.example/comments/comment-1/photo.webp',
      });

      const callOrder: string[] = [];
      compression.compress.mockImplementation(async () => {
        callOrder.push('compress');
        return {
          buffer: compressed,
          sizeKb: 200,
          originalSizeKb: 10000,
          ratio: 50,
          mimetype: 'image/webp',
        };
      });
      client.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return { key: 'ignored', url: 'https://real.example/x' };
      });

      await service.upload('comment-1', makeFile('photo.jpg'));

      expect(callOrder).toEqual(['compress', 'upload']);
      expect(compression.compress).toHaveBeenCalledWith(
        expect.any(Buffer),
        'comment',
        'image/jpeg',
      );
    });

    it('key passed to client.upload is comments/{commentId}/{uuid}.webp (original extension dropped)', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockImplementation(async (key) => ({
        key,
        url: `https://real.example/${key}`,
      }));

      await service.upload('comment-1', makeFile('foto incidente (1).jpg'));

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^comments\/comment-1\/.+\.webp$/);
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
      expect(key).not.toContain('.jpg');
    });

    it('passes the compressed buffer + image/webp mimetype to client.upload', async () => {
      const compressed = Buffer.from('webp-bytes');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 200,
        originalSizeKb: 10000,
        ratio: 50,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/x' });

      await service.upload('comment-1', makeFile('photo.jpg'));

      const [key, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(compressed);
      expect(mimetype).toBe('image/webp');
      expect(key).toMatch(/^comments\/comment-1\/.+\.webp$/);
    });

    it('returns the key/url pair from the injected IStorageClient verbatim', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/uuid.webp',
        url: 'https://real.example/comments/comment-1/uuid.webp',
      });

      const result = await service.upload('comment-1', makeFile('photo.jpg'));

      expect(result).toEqual({
        key: 'comments/comment-1/uuid.webp',
        url: 'https://real.example/comments/comment-1/uuid.webp',
      });
    });

    it('propagates CompressionSizeExceeded from the compression service (300KB cap)', async () => {
      const err = new CompressionSizeExceeded('comment', 350, 300);
      compression.compress.mockRejectedValue(err);

      await expect(service.upload('comment-1', makeFile('photo.jpg'))).rejects.toBe(err);
      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates FileTooLargeError before any upload attempt', async () => {
      const err = new FileTooLargeError(150 * 1024);
      compression.compress.mockRejectedValue(err);

      await expect(service.upload('comment-1', makeFile('photo.jpg'))).rejects.toBe(err);
      expect(client.upload).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed');

      const url = await service.getSignedUrl('comments/comment-1/uuid.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith('comments/comment-1/uuid.webp');
      expect(url).toBe('https://real.example/signed');
    });
  });

  describe('delete', () => {
    it('delegates to the injected IStorageClient', async () => {
      client.delete.mockResolvedValue(undefined);

      await service.delete('comments/abc/uuid.webp');

      expect(client.delete).toHaveBeenCalledWith('comments/abc/uuid.webp');
    });
  });
});
