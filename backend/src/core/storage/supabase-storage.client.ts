import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageConfig } from '../../config/storage.config';
import { IStorageClient, StorageUploadResult } from './storage-client.interface';

/** Signed URL TTL (SC-209 D1) — bucket is private, every resolve is a fresh signed link. */
const SIGNED_URL_EXPIRES_IN_SECONDS = 3600;

/**
 * SupabaseStorageClient (SC-209 D1) — real Supabase Storage backend, used in
 * prod (`STORAGE_PROVIDER=supabase`). Reuses the project's existing Supabase
 * infra instead of adding an AWS account (rejected D1 alternative).
 */
@Injectable()
export class SupabaseStorageClient implements IStorageClient {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(conf: StorageConfig) {
    if (!conf.supabaseUrl) {
      throw new Error('STORAGE_SUPABASE_URL is required when STORAGE_PROVIDER=supabase');
    }
    if (!conf.supabaseServiceKey) {
      throw new Error('STORAGE_SUPABASE_SERVICE_KEY is required when STORAGE_PROVIDER=supabase');
    }
    this.client = createClient(conf.supabaseUrl, conf.supabaseServiceKey);
    this.bucket = conf.supabaseBucket;
  }

  async upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, buffer, {
      contentType: mimetype,
      upsert: false,
    });
    if (error) {
      throw new Error(`Supabase Storage upload failed for "${key}": ${error.message}`);
    }
    return { key, url: await this.getSignedUrl(key) };
  }

  async getSignedUrl(key: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, SIGNED_URL_EXPIRES_IN_SECONDS);
    if (error || !data) {
      throw new Error(`Supabase Storage signed URL failed for "${key}": ${error?.message ?? 'no data'}`);
    }
    return data.signedUrl;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) {
      throw new Error(`Supabase Storage delete failed for "${key}": ${error.message}`);
    }
  }
}
