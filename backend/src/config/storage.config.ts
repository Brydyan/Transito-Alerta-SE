import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  /**
   * SC-209 D1: 'supabase' (prod) or 'noop' (local dev, no creds required).
   * infra/2026-10-07-minio-object-storage: 'minio' added for staging/local
   * (S3-compatible object store in Docker).
   * Env `STORAGE_PROVIDER`, default 'noop'.
   */
  provider: 'supabase' | 'minio' | 'noop';
  // Supabase
  supabaseUrl: string | undefined;
  supabaseServiceKey: string | undefined;
  supabaseBucket: string;
  // MinIO / S3 (design D5: internal vs public split)
  /** Internal Docker endpoint the backend uses to talk to MinIO. */
  minioEndpoint: string | undefined;
  /** Public-facing base URL the browser uses (nginx proxy or direct). */
  minioPublicUrl: string | undefined;
  minioAccessKey: string | undefined;
  minioSecretKey: string | undefined;
  minioBucket: string;
  /** Path-style addressing (required for MinIO). */
  minioForcePathStyle: boolean;
}

function resolveProvider(env: NodeJS.ProcessEnv): StorageConfig['provider'] {
  const raw = (env.STORAGE_PROVIDER ?? 'noop').toLowerCase();
  if (raw === 'supabase') return 'supabase';
  if (raw === 'minio') return 'minio';
  return 'noop';
}

export default registerAs(
  'storage',
  (): StorageConfig => ({
    provider: resolveProvider(process.env),
    supabaseUrl: process.env.STORAGE_SUPABASE_URL || undefined,
    supabaseServiceKey:
      process.env.STORAGE_SUPABASE_SERVICE_KEY || undefined,
    supabaseBucket: process.env.STORAGE_SUPABASE_BUCKET || 'uploads',
    minioEndpoint: process.env.STORAGE_MINIO_ENDPOINT || undefined,
    minioPublicUrl: process.env.STORAGE_MINIO_PUBLIC_URL || undefined,
    minioAccessKey: process.env.STORAGE_MINIO_ACCESS_KEY || undefined,
    minioSecretKey: process.env.STORAGE_MINIO_SECRET_KEY || undefined,
    minioBucket: process.env.STORAGE_MINIO_BUCKET || 'uploads',
    minioForcePathStyle:
      (process.env.STORAGE_MINIO_FORCE_PATH_STYLE ?? 'true').toLowerCase() !==
      'false',
  }),
);
