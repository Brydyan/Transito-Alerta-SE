import { AvatarStorageService } from './avatar-storage.service';

describe('AvatarStorageService', () => {
  let service: AvatarStorageService;

  beforeEach(() => {
    service = new AvatarStorageService();
  });

  it('upload returns a signed URL scoped to avatars/{userId}/... without making a live call', async () => {
    const url = await service.upload('u1', {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: 'photo.png',
    });

    expect(url).toContain('avatars/u1/');
    expect(url).toContain('photo.png');
    expect(url).toMatch(/\?sig=[0-9a-f]{16}$/);
  });

  it('getSignedUrl is deterministic for the same key', () => {
    const a = service.getSignedUrl('avatars/u1/x.png');
    const b = service.getSignedUrl('avatars/u1/x.png');
    expect(a).toBe(b);
  });
});
