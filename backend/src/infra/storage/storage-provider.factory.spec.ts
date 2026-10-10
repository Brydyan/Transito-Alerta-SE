import { StorageConfig } from '../../config/storage.config';
import { MinioStorageClient } from './minio-storage.client';
import { NoopStorageClient } from './noop-storage.client';
import { SupabaseStorageClient } from './supabase-storage.client';
import { resolveStorageClient } from './storage-provider.factory';

function baseConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    provider: 'noop',
    supabaseUrl: undefined,
    supabaseServiceKey: undefined,
    supabaseBucket: 'uploads',
    minioEndpoint: undefined,
    minioPublicUrl: undefined,
    minioAccessKey: undefined,
    minioSecretKey: undefined,
    minioBucket: 'uploads',
    minioForcePathStyle: true,
    ...overrides,
  };
}

describe('resolveStorageClient', () => {
  it('provider "noop" resolves a NoopStorageClient instance', () => {
    const client = resolveStorageClient(baseConfig({ provider: 'noop' }));

    expect(client).toBeInstanceOf(NoopStorageClient);
  });

  it('provider "supabase" with valid creds resolves a SupabaseStorageClient instance (triangulation)', () => {
    const client = resolveStorageClient(
      baseConfig({
        provider: 'supabase',
        supabaseUrl: 'https://project.supabase.co',
        supabaseServiceKey: 'service-key',
      }),
    );

    expect(client).toBeInstanceOf(SupabaseStorageClient);
  });

  it('provider "supabase" with missing creds throws instead of silently falling back to noop', () => {
    expect(() =>
      resolveStorageClient(
        baseConfig({
          provider: 'supabase',
          supabaseUrl: undefined,
          supabaseServiceKey: undefined,
        }),
      ),
    ).toThrow(/STORAGE_SUPABASE_URL/);
  });

  it('provider "minio" with valid creds resolves a MinioStorageClient instance (R1.1)', () => {
    const client = resolveStorageClient(
      baseConfig({
        provider: 'minio',
        minioEndpoint: 'http://minio:9000',
        minioPublicUrl: 'http://localhost:8083/storage',
        minioAccessKey: 'minioadmin',
        minioSecretKey: 'minioadmin123',
        minioBucket: 'uploads',
        minioForcePathStyle: true,
      }),
    );

    expect(client).toBeInstanceOf(MinioStorageClient);
  });

  it('provider "minio" with missing minioEndpoint throws with the endpoint var name (R1.2)', () => {
    expect(() =>
      resolveStorageClient(
        baseConfig({
          provider: 'minio',
          minioEndpoint: undefined,
          minioAccessKey: 'admin',
          minioSecretKey: 'secret',
        }),
      ),
    ).toThrow(/STORAGE_MINIO_ENDPOINT/);
  });

  it('provider "minio" with missing minioAccessKey throws with the access-key var name (R1.2)', () => {
    expect(() =>
      resolveStorageClient(
        baseConfig({
          provider: 'minio',
          minioEndpoint: 'http://minio:9000',
          minioAccessKey: undefined,
          minioSecretKey: 'secret',
        }),
      ),
    ).toThrow(/STORAGE_MINIO_ACCESS_KEY/);
  });

  it('provider "minio" with missing minioSecretKey throws with the secret-key var name (R1.2)', () => {
    expect(() =>
      resolveStorageClient(
        baseConfig({
          provider: 'minio',
          minioEndpoint: 'http://minio:9000',
          minioAccessKey: 'admin',
          minioSecretKey: undefined,
        }),
      ),
    ).toThrow(/STORAGE_MINIO_SECRET_KEY/);
  });
});
