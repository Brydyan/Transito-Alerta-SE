import { Logger } from '@nestjs/common';
import { StorageConfig } from '../../config/storage.config';
import { MinioStorageClient } from './minio-storage.client';

/**
 * Unit tests for MinioStorageClient (infra/2026-10-07-minio-object-storage,
 * T2.2). The `@aws-sdk/client-s3` module is MOCKED at the module level so
 * we can assert on the `PutObjectCommand` / `DeleteObjectCommand` payloads
 * without a real MinIO. The factory-level "is this a MinioStorageClient
 * at all?" check is in `storage-provider.factory.spec.ts`.
 */

const s3Send = jest.fn();
const s3ClientCtor = jest.fn(() => ({ send: s3Send }));

jest.mock('@aws-sdk/client-s3', () => {
  return {
    __esModule: true,
    S3Client: jest.fn().mockImplementation(() => ({ send: s3Send })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});

// Re-import after mock registration.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const S3ClientMock = S3Client as unknown as jest.Mock;
const PutObjectCommandMock = PutObjectCommand as unknown as jest.Mock;
const DeleteObjectCommandMock = DeleteObjectCommand as unknown as jest.Mock;

function conf(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    provider: 'minio',
    supabaseUrl: undefined,
    supabaseServiceKey: undefined,
    supabaseBucket: 'uploads',
    minioEndpoint: 'http://minio:9000',
    minioPublicUrl: 'http://localhost:8083/storage',
    minioAccessKey: 'minioadmin',
    minioSecretKey: 'minioadmin123',
    minioBucket: 'uploads',
    minioForcePathStyle: true,
    ...overrides,
  };
}

describe('MinioStorageClient', () => {
  let logWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    s3Send.mockReset();
    s3ClientCtor.mockClear();
    S3ClientMock.mockClear();
    PutObjectCommandMock.mockClear();
    DeleteObjectCommandMock.mockClear();
    logWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor (fail-fast on missing creds)', () => {
    it('throws when minioEndpoint is missing', () => {
      expect(
        () => new MinioStorageClient(conf({ minioEndpoint: undefined })),
      ).toThrow(/STORAGE_MINIO_ENDPOINT/);
    });

    it('throws when minioAccessKey is missing', () => {
      expect(
        () => new MinioStorageClient(conf({ minioAccessKey: undefined })),
      ).toThrow(/STORAGE_MINIO_ACCESS_KEY/);
    });

    it('throws when minioSecretKey is missing', () => {
      expect(
        () => new MinioStorageClient(conf({ minioSecretKey: undefined })),
      ).toThrow(/STORAGE_MINIO_SECRET_KEY/);
    });

    it('constructs the S3Client with the internal endpoint, credentials, and path-style forced', () => {
      new MinioStorageClient(conf());

      expect(S3ClientMock).toHaveBeenCalledTimes(1);
      const arg = S3ClientMock.mock.calls[0][0];
      expect(arg.endpoint).toBe('http://minio:9000');
      expect(arg.credentials).toEqual({
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin123',
      });
      expect(arg.forcePathStyle).toBe(true);
    });
  });

  describe('upload (R2)', () => {
    it('sends a PutObjectCommand with Bucket, Key, Body, ContentType and returns the public URL', async () => {
      s3Send.mockResolvedValue({});
      const client = new MinioStorageClient(conf());

      const result = await client.upload(
        'incidents/inc-1/photo.webp',
        Buffer.from('webp-bytes'),
        'image/webp',
      );

      expect(PutObjectCommandMock).toHaveBeenCalledTimes(1);
      const payload = PutObjectCommandMock.mock.calls[0][0];
      expect(payload.Bucket).toBe('uploads');
      expect(payload.Key).toBe('incidents/inc-1/photo.webp');
      expect(payload.ContentType).toBe('image/webp');
      expect(Buffer.isBuffer(payload.Body)).toBe(true);
      expect((payload.Body as Buffer).toString()).toBe('webp-bytes');

      expect(result).toEqual({
        key: 'incidents/inc-1/photo.webp',
        url: 'http://localhost:8083/storage/incidents/inc-1/photo.webp',
      });
    });

    it('uses the configured bucket name (not always "uploads")', async () => {
      s3Send.mockResolvedValue({});
      const client = new MinioStorageClient(
        conf({ minioBucket: 'custom-bucket' }),
      );

      await client.upload('x.webp', Buffer.from('y'), 'image/webp');

      const payload = PutObjectCommandMock.mock.calls[0][0];
      expect(payload.Bucket).toBe('custom-bucket');
    });
  });

  describe('getSignedUrl (R3 — public, no expiry)', () => {
    it('returns the permanent public URL with no signature or expiry query string', async () => {
      const client = new MinioStorageClient(
        conf({
          minioPublicUrl: 'http://staging.server:8083/storage',
        }),
      );

      const url = await client.getSignedUrl('incidents/inc-1/photo.webp');

      expect(url).toBe(
        'http://staging.server:8083/storage/incidents/inc-1/photo.webp',
      );
      expect(url).not.toMatch(/[?&](X-Amz|Signature|Expires|AWSAccessKeyId)=/);
    });

    it('falls back to `<endpoint>/<bucket>` when minioPublicUrl is not set', async () => {
      const client = new MinioStorageClient(
        conf({ minioPublicUrl: undefined, minioEndpoint: 'http://minio:9000' }),
      );

      const url = await client.getSignedUrl('comments/c-1/uuid.webp');

      expect(url).toBe('http://minio:9000/uploads/comments/c-1/uuid.webp');
    });

    it('does NOT call the S3 client (no SDK roundtrip needed for a public bucket)', async () => {
      const client = new MinioStorageClient(conf());
      await client.getSignedUrl('any.webp');
      expect(s3Send).not.toHaveBeenCalled();
    });

    it('strips trailing slashes from minioPublicUrl so concatenation is clean', async () => {
      const client = new MinioStorageClient(
        conf({ minioPublicUrl: 'http://staging.server:8083/storage///' }),
      );

      const url = await client.getSignedUrl('a.webp');

      expect(url).toBe('http://staging.server:8083/storage/a.webp');
    });
  });

  describe('delete (R4 — idempotent)', () => {
    it('sends a DeleteObjectCommand with the right Bucket and Key on success', async () => {
      s3Send.mockResolvedValue({});
      const client = new MinioStorageClient(conf());

      await client.delete('comments/c-1/uuid.webp');

      expect(DeleteObjectCommandMock).toHaveBeenCalledTimes(1);
      const payload = DeleteObjectCommandMock.mock.calls[0][0];
      expect(payload.Bucket).toBe('uploads');
      expect(payload.Key).toBe('comments/c-1/uuid.webp');
    });

    it('does NOT throw when the underlying S3 send rejects (R4.2 — idempotent)', async () => {
      s3Send.mockRejectedValue(new Error('NoSuchKey'));
      const client = new MinioStorageClient(conf());

      await expect(client.delete('comments/c-1/inexistente.webp')).resolves.toBeUndefined();
      expect(logWarnSpy).toHaveBeenCalled();
    });

    it('does NOT throw when the underlying S3 send throws a transport error', async () => {
      s3Send.mockRejectedValue(new Error('ECONNRESET'));
      const client = new MinioStorageClient(conf());

      await expect(client.delete('comments/c-1/x.webp')).resolves.toBeUndefined();
    });
  });
});
