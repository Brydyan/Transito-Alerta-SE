import { NoopStorageClient } from './noop-storage.client';
import { SupabaseStorageClient } from './supabase-storage.client';
import { resolveStorageClient } from './storage-provider.factory';

describe('resolveStorageClient', () => {
  it('provider "noop" resolves a NoopStorageClient instance', () => {
    const client = resolveStorageClient({
      provider: 'noop',
      supabaseUrl: undefined,
      supabaseServiceKey: undefined,
      supabaseBucket: 'uploads',
    });

    expect(client).toBeInstanceOf(NoopStorageClient);
  });

  it('provider "supabase" with valid creds resolves a SupabaseStorageClient instance (triangulation)', () => {
    const client = resolveStorageClient({
      provider: 'supabase',
      supabaseUrl: 'https://project.supabase.co',
      supabaseServiceKey: 'service-key',
      supabaseBucket: 'uploads',
    });

    expect(client).toBeInstanceOf(SupabaseStorageClient);
  });

  it('provider "supabase" with missing creds throws instead of silently falling back to noop', () => {
    expect(() =>
      resolveStorageClient({
        provider: 'supabase',
        supabaseUrl: undefined,
        supabaseServiceKey: undefined,
        supabaseBucket: 'uploads',
      }),
    ).toThrow(/STORAGE_SUPABASE_URL/);
  });
});
