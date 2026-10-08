import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { StartedTestContainer } from 'testcontainers';

const E2E_SHARED_ENV_FILE = path.join(os.tmpdir(), 'tase-e2e-shared.json');

export default async function globalTeardown(): Promise<void> {
  const pg = (global as Record<string, unknown>)['__TASE_PG_CONTAINER__'] as StartedTestContainer | undefined;
  const redis = (global as Record<string, unknown>)['__TASE_REDIS_CONTAINER__'] as StartedTestContainer | undefined;

  await redis?.stop();
  await pg?.stop();

  if (fs.existsSync(E2E_SHARED_ENV_FILE)) {
    fs.unlinkSync(E2E_SHARED_ENV_FILE);
  }
}
