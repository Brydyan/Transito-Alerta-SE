import { IStorageClient } from '../../core/storage/storage-client.interface';
import { CommentImageStorageService, MulterFile } from './comment-image-storage.service';

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

  it('upload: builds a comments/{commentId}/{uuid}-{sanitized} key and delegates bytes to the injected IStorageClient', async () => {
    client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/comments/comment-1/photo.jpg' });

    const { url } = await service.upload('comment-1', makeFile('photo.jpg'));

    expect(client.upload).toHaveBeenCalledTimes(1);
    const [key, buffer, mimetype] = client.upload.mock.calls[0];
    expect(key).toMatch(/^comments\/comment-1\/.+-photo\.jpg$/);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(mimetype).toBe('image/jpeg');
    expect(url).toBe('https://real.example/comments/comment-1/photo.jpg');
  });

  it('upload: special chars in originalname are sanitized in the key (triangulation)', async () => {
    client.upload.mockResolvedValue({ key: 'ignored', url: 'https://real.example/x' });

    await service.upload('comment-1', makeFile('foto incidente (1).jpg'));

    const [key] = client.upload.mock.calls[0];
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
    expect(key).not.toContain(')');
    expect(key).toContain('comment-1');
  });

  it('upload: propagates the real key/url pair returned by the storage client verbatim', async () => {
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

  it('getSignedUrl: delegates to the injected IStorageClient and returns its resolved url', async () => {
    client.getSignedUrl.mockResolvedValue('https://real.example/signed');

    const url = await service.getSignedUrl('comments/abc/test.jpg');

    expect(client.getSignedUrl).toHaveBeenCalledWith('comments/abc/test.jpg');
    expect(url).toBe('https://real.example/signed');
  });

  it('delete: delegates to the injected IStorageClient', async () => {
    client.delete.mockResolvedValue(undefined);

    await service.delete('comments/abc/key.jpg');

    expect(client.delete).toHaveBeenCalledWith('comments/abc/key.jpg');
  });
});
