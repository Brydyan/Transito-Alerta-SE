import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  /** SC-209 D1: 'supabase' (prod) or 'noop' (local dev, no creds required). Env `STORAGE_PROVIDER`, default 'noop'. */
  provider: 'supabase' | 'noop';
  supabaseUrl: string | undefined;
  supabaseServiceKey: string | undefined;
  supabaseBucket: string;
}

export default registerAs(
  'storage',
  (): StorageConfig => ({
    provider: process.env.STORAGE_PROVIDER === 'supabase' ? 'supabase' : 'noop',
    supabaseUrl: process.env.STORAGE_SUPABASE_URL || undefined,
    supabaseServiceKey: process.env.STORAGE_SUPABASE_SERVICE_KEY || undefined,
    supabaseBucket: process.env.STORAGE_SUPABASE_BUCKET || 'uploads',
  }),
);
