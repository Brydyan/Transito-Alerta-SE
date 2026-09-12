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

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe('CommentImageStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let service: CommentImageStorageService;

  beforeEach(() => {
    client = makeClientMock();
    service = new CommentImageStorageService(client);
  });

  describe('upload', () => {
    it('generates a key with format comments/{commentId}/{uuid}-{originalname}', async () => {
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/uuid-photo.jpg',
        url: 'https://real.example/comments/comment-1/uuid-photo.jpg',
      });

      await service.upload('comment-1', makeFile('photo.jpg'));

      expect(client.upload.mock.calls[0][0]).toMatch(/^comments\/comment-1\/.+-photo\.jpg$/);
    });

    it('delegates to the injected IStorageClient with the file buffer and mimetype', async () => {
      const file = makeFile('photo.jpg');
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/uuid-photo.jpg',
        url: 'https://real.example/comments/comment-1/uuid-photo.jpg',
      });

      const result = await service.upload('comment-1', file);

      const [, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(file.buffer);
      expect(mimetype).toBe('image/jpeg');
      expect(result).toEqual({
        key: 'comments/comment-1/uuid-photo.jpg',
        url: 'https://real.example/comments/comment-1/uuid-photo.jpg',
      });
    });

    it('returns the result from the injected IStorageClient verbatim', async () => {
      client.upload.mockResolvedValue({
        key: 'comments/comment-1/uuid-photo.jpg',
        url: 'https://real.example/comments/comment-1/uuid-photo.jpg',
      });

      const result = await service.upload('comment-1', makeFile('photo.jpg'));

      expect(result).toEqual({
        key: 'comments/comment-1/uuid-photo.jpg',
        url: 'https://real.example/comments/comment-1/uuid-photo.jpg',
      });
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed');

      const url = await service.getSignedUrl('comments/comment-1/uuid-photo.jpg');

      expect(client.getSignedUrl).toHaveBeenCalledWith('comments/comment-1/uuid-photo.jpg');
      expect(url).toBe('https://real.example/signed');
    });
  });

  describe('delete', () => {
    it('delegates to the injected IStorageClient', async () => {
      client.delete.mockResolvedValue(undefined);

      await service.delete('comments/abc/uuid-photo.jpg');

      expect(client.delete).toHaveBeenCalledWith('comments/abc/uuid-photo.jpg');
    });
  });
});
