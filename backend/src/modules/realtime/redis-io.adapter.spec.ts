import { IoAdapter } from '@nestjs/platform-socket.io';
import { RedisIoAdapter } from './redis-io.adapter';

// Two socket.io copies live in this repo's tree (see redis-io.adapter.ts's
// comment on close()) — `unknown` avoids pinning the test to either one.
type FakeServer = Parameters<IoAdapter['close']>[0];

const disconnectMocks: jest.Mock[] = [];

// ioredis default-exports its client class; the mock below replaces it with
// a constructor that records every disconnect() so the test can assert both
// pubClient AND its duplicate() (subClient) were actually torn down.
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    const disconnect = jest.fn();
    disconnectMocks.push(disconnect);
    return {
      disconnect,
      duplicate: jest.fn().mockImplementation(() => {
        const dupDisconnect = jest.fn();
        disconnectMocks.push(dupDisconnect);
        return { disconnect: dupDisconnect };
      }),
    };
  });
});

jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));

describe('RedisIoAdapter', () => {
  let app: { get: jest.Mock };
  let fakeServer: { adapter: jest.Mock };
  let adapter: RedisIoAdapter;

  beforeEach(() => {
    disconnectMocks.length = 0;
    app = {
      get: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({ redisUrl: 'redis://localhost:6379' }),
      }),
    };
    fakeServer = { adapter: jest.fn() };
    jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue(fakeServer as unknown as FakeServer);
    jest.spyOn(IoAdapter.prototype, 'close').mockResolvedValue(undefined);

    adapter = new RedisIoAdapter(app as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Discovered via the e2e harness (T4.1a): plain HTTP-only tests never
  // exercise a real shutdown against a real Redis, so pubClient/subClient
  // outliving app.close() had no seam to be caught on before. Left
  // uncleaned, each one retries forever under ioredis's default infinite
  // retry strategy once its target Redis disappears.
  it('disconnects pubClient and subClient after delegating to the base adapter close', async () => {
    adapter.createIOServer(3001);

    await adapter.close(fakeServer as unknown as FakeServer);

    expect(IoAdapter.prototype.close).toHaveBeenCalledWith(fakeServer);
    expect(disconnectMocks).toHaveLength(2);
    disconnectMocks.forEach((disconnect) => expect(disconnect).toHaveBeenCalledTimes(1));
  });

  it('does not throw closing an adapter whose server was never created', async () => {
    await expect(adapter.close(fakeServer as unknown as FakeServer)).resolves.toBeUndefined();
  });
});
