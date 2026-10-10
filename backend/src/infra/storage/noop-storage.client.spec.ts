import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { NoopStorageClient } from './noop-storage.client';

describe('NoopStorageClient', () => {
  let rootDir: string;
  let client: NoopStorageClient;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'noop-storage-'));
    client = new NoopStorageClient(rootDir);
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('upload: writes the buffer to {rootDir}/{key} and returns a file:// url containing the key', async () => {
    const { key, url } = await client.upload(
      'comments/c1/photo.jpg',
      Buffer.from('hello-bytes'),
      'image/jpeg',
    );

    expect(key).toBe('comments/c1/photo.jpg');
    expect(url).toBe(`file://${join(rootDir, 'comments/c1/photo.jpg')}`);
    expect(existsSync(join(rootDir, 'comments/c1/photo.jpg'))).toBe(true);
    expect(readFileSync(join(rootDir, 'comments/c1/photo.jpg')).toString()).toBe('hello-bytes');
  });

  it('upload: a different key/buffer writes to a different path with different content (triangulation)', async () => {
    const { key, url } = await client.upload(
      'avatars/u9/pic.png',
      Buffer.from('other-bytes'),
      'image/png',
    );

    expect(key).toBe('avatars/u9/pic.png');
    expect(url).toBe(`file://${join(rootDir, 'avatars/u9/pic.png')}`);
    expect(readFileSync(join(rootDir, 'avatars/u9/pic.png')).toString()).toBe('other-bytes');
  });

  it('getSignedUrl: deterministic file:// url for the same key, without requiring a prior upload', async () => {
    const a = await client.getSignedUrl('comments/c1/photo.jpg');
    const b = await client.getSignedUrl('comments/c1/photo.jpg');
    expect(a).toBe(b);
    expect(a).toBe(`file://${join(rootDir, 'comments/c1/photo.jpg')}`);
  });

  it('delete: removes a previously uploaded object', async () => {
    await client.upload('comments/c2/x.jpg', Buffer.from('x'), 'image/jpeg');
    expect(existsSync(join(rootDir, 'comments/c2/x.jpg'))).toBe(true);

    await client.delete('comments/c2/x.jpg');

    expect(existsSync(join(rootDir, 'comments/c2/x.jpg'))).toBe(false);
  });

  it('delete: resolves without throwing when the key was never uploaded (idempotent)', async () => {
    await expect(client.delete('comments/never/uploaded.jpg')).resolves.toBeUndefined();
  });
});
