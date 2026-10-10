import { ImageCompressionService } from '../../infra/image/image-compression.service';
import { IStorageClient } from '../../infra/storage/storage-client.interface';
import {
  CommentImageStorageService,
  MulterFile,
} from './comment-image-storage.service';

function makeFile(originalname: string): MulterFile {
  return {
    originalname,
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('orig'),
    fieldname: 'images',
    encoding: '7bit',
  };
}

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

describe('CommentImageStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let imageCompression: jest.Mocked<ImageCompressionService>;
  let service: CommentImageStorageService;

  beforeEach(() => {
    client = makeClientMock();
    imageCompression = makeCompressionMock();
    service = new CommentImageStorageService(client, imageCompression);
  });

  describe('upload', () => {
    it('generates a key with format comments/{commentId}/{uuid}.webp (F7)', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });

      await service.upload('comment-1', makeFile('photo.jpg'));

      expect(client.upload.mock.calls[0][0]).toMatch(
        /^comments\/comment-1\/.+\.webp$/,
      );
    });

    it('calls imageCompression.compress with the comment type', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });

      const file = makeFile('photo.jpg');
      await service.upload('comment-1', file);

      expect(imageCompression.compress).toHaveBeenCalledWith(
        file.buffer,
        'comment',
        'image/jpeg',
      );
    });

    it('passes the WebP buffer and image/webp MIME to client.upload (R8)', async () => {
      const webpBytes = Buffer.from('webp-bytes');
      imageCompression.compress.mockResolvedValue({
        buffer: webpBytes,
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });

      await service.upload('comment-1', makeFile('photo.jpg'));

      const [, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(webpBytes);
      expect(mimetype).toBe('image/webp');
    });

    it('returns the result from the injected IStorageClient verbatim', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });

      const result = await service.upload('comment-1', makeFile('photo.jpg'));

      expect(result).toEqual({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });
    });

    it('propagates compress() errors (UnsupportedMimeType)', async () => {
      const { UnsupportedMimeType } = await import(
        '../../infra/image/compression-error.exception'
      );
      const err = new UnsupportedMimeType('image/gif');
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('comment-1', {
          ...makeFile('pic.gif'),
          mimetype: 'image/gif',
        }),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);

      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates compress() errors (CompressionFailed)', async () => {
      const { CompressionFailed } = await import(
        '../../infra/image/compression-error.exception'
      );
      const err = new CompressionFailed(new Error('corrupt'));
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('comment-1', makeFile('corrupt.jpg')),
      ).rejects.toBeInstanceOf(CompressionFailed);

      expect(client.upload).not.toHaveBeenCalled();
    });

    it('uses an empty buffer fallback when MulterFile.buffer is undefined (multer memoryStorage edge)', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 0,
        ratio: 0,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/abc.webp',
        url: 'https://real.example/comments/comment-1/abc.webp',
      });

      const file: MulterFile = {
        ...makeFile('photo.jpg'),
        buffer: undefined,
      };

      await service.upload('comment-1', file);

      // Compression received the empty fallback buffer.
      const [bufferArg] = imageCompression.compress.mock.calls[0];
      expect(bufferArg).toBeInstanceOf(Buffer);
      expect((bufferArg as Buffer).length).toBe(0);
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed');

      const url = await service.getSignedUrl('comments/comment-1/abc.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith(
        'comments/comment-1/abc.webp',
      );
      expect(url).toBe('https://real.example/signed');
    });
  });

  describe('delete', () => {
    it('delegates to the injected IStorageClient', async () => {
      client.delete.mockResolvedValue(undefined);

      await service.delete('comments/abc/xyz.webp');

      expect(client.delete).toHaveBeenCalledWith('comments/abc/xyz.webp');
    });
  });
});
