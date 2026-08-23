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

describe('CommentImageStorageService', () => {
  let service: CommentImageStorageService;

  beforeEach(() => { service = new CommentImageStorageService(); });

  it('upload: returned key starts with comments/{commentId}/', async () => {
    const { key } = await service.upload('comment-1', makeFile('photo.jpg'));
    expect(key).toMatch(/^comments\/comment-1\//);
  });

  it('upload: special chars in originalname are sanitized in the key', async () => {
    const { key } = await service.upload('comment-1', makeFile('foto incidente (1).jpg'));
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
    expect(key).not.toContain(')');
    expect(key).toContain('comment-1');
  });

  it('getSignedUrl: returns deterministic URL for the same key', () => {
    const key = 'comments/abc/test.jpg';
    expect(service.getSignedUrl(key)).toBe(service.getSignedUrl(key));
    expect(service.getSignedUrl(key)).toContain('https://storage.example.com/');
  });

  it('delete: resolves without throwing (stub)', async () => {
    await expect(service.delete('comments/abc/key.jpg')).resolves.toBeUndefined();
  });
});
