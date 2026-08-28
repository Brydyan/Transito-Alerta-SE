const uploadMock = jest.fn();
const createSignedUrlMock = jest.fn();
const removeMock = jest.fn();
const fromMock = jest.fn(() => ({
  upload: uploadMock,
  createSignedUrl: createSignedUrlMock,
  remove: removeMock,
}));
const createClientMock = jest.fn((_url?: string, _key?: string) => ({ storage: { from: fromMock } }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => createClientMock(url, key),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { SupabaseStorageClient } from './supabase-storage.client';

const CONF = {
  provider: 'supabase' as const,
  supabaseUrl: 'https://project.supabase.co',
  supabaseServiceKey: 'service-key',
  supabaseBucket: 'test-bucket',
};

describe('SupabaseStorageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructor: throws when supabaseUrl or supabaseServiceKey is missing', () => {
    expect(
      () =>
        new SupabaseStorageClient({
          provider: 'supabase',
          supabaseUrl: undefined,
          supabaseServiceKey: 'k',
          supabaseBucket: 'b',
        }),
    ).toThrow(/STORAGE_SUPABASE_URL/);

    expect(
      () =>
        new SupabaseStorageClient({
          provider: 'supabase',
          supabaseUrl: 'https://x.supabase.co',
          supabaseServiceKey: undefined,
          supabaseBucket: 'b',
        }),
    ).toThrow(/STORAGE_SUPABASE_SERVICE_KEY/);
  });

  it('upload: uploads the buffer to the configured bucket at `key` with contentType, then returns a signed url', async () => {
    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example/photo.jpg' }, error: null });

    const client = new SupabaseStorageClient(CONF);
    const result = await client.upload('comments/c1/photo.jpg', Buffer.from('bytes'), 'image/jpeg');

    expect(fromMock).toHaveBeenCalledWith('test-bucket');
    expect(uploadMock).toHaveBeenCalledWith(
      'comments/c1/photo.jpg',
      Buffer.from('bytes'),
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(createSignedUrlMock).toHaveBeenCalledWith('comments/c1/photo.jpg', expect.any(Number));
    expect(result).toEqual({ key: 'comments/c1/photo.jpg', url: 'https://signed.example/photo.jpg' });
  });

  it('upload: a different key/bucket path produces a signed url scoped to that key (triangulation)', async () => {
    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example/avatar.png' }, error: null });

    const client = new SupabaseStorageClient(CONF);
    const result = await client.upload('avatars/u1/avatar.png', Buffer.from('other'), 'image/png');

    expect(uploadMock).toHaveBeenCalledWith(
      'avatars/u1/avatar.png',
      Buffer.from('other'),
      expect.objectContaining({ contentType: 'image/png' }),
    );
    expect(result).toEqual({ key: 'avatars/u1/avatar.png', url: 'https://signed.example/avatar.png' });
  });

  it('upload: throws a descriptive error when the SDK returns an error', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'bucket not found' } });

    const client = new SupabaseStorageClient(CONF);

    await expect(client.upload('x/y.jpg', Buffer.from('b'), 'image/jpeg')).rejects.toThrow(/bucket not found/);
  });

  it('getSignedUrl: resolves the SDK signed url for the key', async () => {
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example/key.jpg' }, error: null });

    const client = new SupabaseStorageClient(CONF);
    const url = await client.getSignedUrl('comments/c1/key.jpg');

    expect(createSignedUrlMock).toHaveBeenCalledWith('comments/c1/key.jpg', expect.any(Number));
    expect(url).toBe('https://signed.example/key.jpg');
  });

  it('delete: calls remove([key]) on the configured bucket', async () => {
    removeMock.mockResolvedValue({ error: null });

    const client = new SupabaseStorageClient(CONF);
    await client.delete('comments/c1/photo.jpg');

    expect(removeMock).toHaveBeenCalledWith(['comments/c1/photo.jpg']);
  });

  it('delete: throws a descriptive error when the SDK returns an error', async () => {
    removeMock.mockResolvedValue({ error: { message: 'object not found' } });

    const client = new SupabaseStorageClient(CONF);

    await expect(client.delete('missing.jpg')).rejects.toThrow(/object not found/);
  });
});
