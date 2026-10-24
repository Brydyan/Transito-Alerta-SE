import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { IStorageClient, StorageUploadResult } from './storage-client.interface';

/**
 * NoopStorageClient (SC-209 D1 "noop") — local-dev storage backend. Writes
 * bytes under `{rootDir}/{key}` on disk instead of a real bucket, so the
 * dev/test suite runs with zero external creds. `rootDir` defaults to
 * `<cwd>/.storage` (gitignored) but is injectable for test isolation.
 */
@Injectable()
export class NoopStorageClient implements IStorageClient {
  constructor(private readonly rootDir: string = resolve(process.cwd(), '.storage')) {}

  async upload(key: string, buffer: Buffer, _mimetype: string): Promise<StorageUploadResult> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { key, url: this.toFileUrl(key) };
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.toFileUrl(key);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }

  private resolvePath(key: string): string {
    return join(this.rootDir, key);
  }

  private toFileUrl(key: string): string {
    return `file://${this.resolvePath(key)}`;
  }
}
