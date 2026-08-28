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

  it('upload: builds an avatars/{userId}/{uuid}-{originalname} key and returns the url resolved by the injected IStorageClient', async () => {
    client.upload.mockResolvedValue({
      key: 'ignored',
      url: 'https://real.example/avatars/u1/photo.png',
    });

    const url = await service.upload('u1', {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: 'photo.png',
    });

    expect(client.upload).toHaveBeenCalledTimes(1);
    const [key, buffer, mimetype] = client.upload.mock.calls[0];
    expect(key).toMatch(/^avatars\/u1\/.+-photo\.png$/);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(mimetype).toBe('image/png');
    expect(url).toBe('https://real.example/avatars/u1/photo.png');
  });

  it('upload: a different userId/file produces a differently scoped key (triangulation)', async () => {
    client.upload.mockResolvedValue({
      key: 'ignored',
      url: 'https://real.example/avatars/u2/pic.jpg',
    });

    await service.upload('u2', {
      buffer: Buffer.from('y'),
      mimetype: 'image/jpeg',
      originalname: 'pic.jpg',
    });

    const [key] = client.upload.mock.calls[0];
    expect(key).toMatch(/^avatars\/u2\//);
    expect(key).toContain('pic.jpg');
  });

  it('getSignedUrl: delegates to the injected IStorageClient and returns its resolved url', async () => {
    client.getSignedUrl.mockResolvedValue('https://real.example/signed-avatar');

    const url = await service.getSignedUrl('avatars/u1/x.png');

    expect(client.getSignedUrl).toHaveBeenCalledWith('avatars/u1/x.png');
    expect(url).toBe('https://real.example/signed-avatar');
  });
});
