/**
 * IStorageClient (SC-209 Phase A, design D1/D2) — the low-level seam a
 * concrete object-storage backend plugs into. `CommentImageStorageService`
 * and `AvatarStorageService` each keep their OWN public contract (design D2
 * explicitly rejects a shared interface between those two services — their
 * signatures differ), but both inject ONE of these underneath to actually
 * persist bytes. Swapping `STORAGE_PROVIDER` swaps the client, not the
 * services.
 */
export interface StorageUploadResult {
  key: string;
  url: string;
}

export interface IStorageClient {
  /** Persist `buffer` at `key` and return the (possibly async) resolvable URL. */
  upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult>;
  /** Resolve a fresh signed/public URL for an already-stored key. */
  getSignedUrl(key: string): Promise<string>;
  /** Remove the object at `key`. MUST be idempotent — deleting an already-absent key resolves, not throws. */
  delete(key: string): Promise<void>;
}

/** DI token — `storage.module.ts` binds this to either SupabaseStorageClient or NoopStorageClient. */
export const STORAGE_CLIENT = 'STORAGE_CLIENT';
