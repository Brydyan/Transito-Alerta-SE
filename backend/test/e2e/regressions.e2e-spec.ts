import { createServer } from 'net';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { INestApplicationContext } from '@nestjs/common';
import Redis from 'ioredis';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';

import { EventsGateway } from '../../src/modules/realtime/events.gateway';
import { RealtimeStreamsConsumer } from '../../src/modules/realtime/streams.consumer';
import { RedisIoAdapter } from '../../src/modules/realtime/redis-io.adapter';
import { TestEnvironment } from '../support/test-environment';

/**
 * One regression test per defect shipped in Phases 1-2 (commits 15fe082,
 * 71dc3d6, 985162b, 7284831, d640339, 9dffec8). Every one of these shipped
 * with a fully green unit suite because each lived on a seam its unit test
 * mocked — two tests actively asserted the broken behaviour. These run
 * against real HTTP, real Postgres and real Redis (never a mock) so a
 * regression here fails loudly instead of quietly.
 */
describe('E2E regressions — one test per shipped defect (T4.1a step 2, Part A)', () => {
  let env: TestEnvironment;

  const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  // --- 1. JwtStrategy identity (15fe082) ---------------------------------
  // `sub` (user.id) was passed to getPermissions(), which resolves by
  // device_uuid -> []. Every guarded route 403'd for every caller, even one
  // holding the required permission. Only /api/health and /api/auth/* were
  // reachable.
  it('an authenticated caller holding a permission reaches the guarded handler (regression: 15fe082)', async () => {
    const operator = await env.provisionUser(['READ incidents']);

    const response = await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  // --- 2. EventsGateway identity (71dc3d6) --------------------------------
  // The same user.id/device_uuid confusion, missed in the WebSocket path:
  // canJoinRoom() resolved permissions to [] for every connection, so no
  // socket could ever join a geo:/org:/incident: room and realtime went
  // dark. A real socket.io client, not a mocked gateway.
  it('a real socket.io client with a valid token can join a permitted room and receive an emitted event (regression: 71dc3d6)', async () => {
    const operator = await env.provisionUser(['READ incidents', 'CREATE incidents']);
    const address = env.httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const socket: Socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token: operator.accessToken },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
      });

      // The client's 'connect' event fires once the transport handshake
      // completes, which races handleConnection()'s own async work
      // (verifying the token, resolving permissions from Redis, awaiting
      // the auto-join to user:{id}) — none of that is signalled back to the
      // client. Retrying the join is the honest fix for that inherent race,
      // not a weakened assertion: a permission-resolution regression would
      // make every attempt return joined:false, not just the first one.
      const joinAck = await joinWithRetry(socket, `geo:${SANTA_ELENA_ZONE_ID}`);
      expect(joinAck).toEqual({ joined: true, room: `geo:${SANTA_ELENA_ZONE_ID}` });

      const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
        socket.once('incident.created', resolve);
      });

      await request(env.httpServer)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
        .expect(201);

      const received = await eventPromise;
      expect(received).toMatchObject({ zone_id: SANTA_ELENA_ZONE_ID });
    } finally {
      socket.disconnect();
    }
    // 60s, not the file's usual default: RealtimeStreamsConsumer permanently
    // parks the app's single REDIS_CLIENT inside a 5s-BLOCK XREADGROUP loop
    // (design D5) — every XADD from a write (this incident's create() among
    // them) queues behind whichever BLOCK call is in flight on that same
    // connection. Observed consistently adding several seconds of latency to
    // every incident write across this whole suite, not specific to this
    // test. That is a real production latency finding worth a follow-up
    // (a dedicated connection for producers, like the harness already uses
    // for its own redisStreams client) — out of scope to fix here.
  }, 60_000);

  // --- 3. Response casing (985162b) ---------------------------------------
  // The first interceptor implementation traversed only plain object
  // literals, silently skipping TypeORM entity instances — the exact
  // payload it exists to convert. Comments/Users/Assignments leaked
  // camelCase; only Incidents (raw SQL rows, already snake_case) looked
  // correct, and only by accident.
  it('snake_cases an entity-backed response (comments) and leaves a raw-SQL response (incidents) unchanged (regression: 985162b)', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'CREATE comments',
      'READ comments',
    ]);
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const incidentResponse = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);
    expect(incidentResponse.body).toHaveProperty('zone_id');
    expect(incidentResponse.body).toHaveProperty('geofence_matched');
    expect(incidentResponse.body).not.toHaveProperty('zoneId');
    expect(incidentResponse.body).not.toHaveProperty('geofenceMatched');

    const commentResponse = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentResponse.body.id, content: 'Yo pase por ahi' })
      .expect(201);
    expect(commentResponse.body).toHaveProperty('incident_id');
    expect(commentResponse.body).toHaveProperty('user_id');
    expect(commentResponse.body).not.toHaveProperty('incidentId');
    expect(commentResponse.body).not.toHaveProperty('userId');
  });

  // --- 4. UPDATE...RETURNING tuple (7284831) ------------------------------
  // TypeORM's Postgres driver special-cases UPDATE/DELETE
  // (`result.raw = [raw.rows, raw.rowCount]`) while INSERT/SELECT return
  // rows directly. updateStatus() used the INSERT idiom, so rows[0] was the
  // whole row ARRAY, not the first row — no `id`/`zone_id` on the response.
  it('PATCH /incidents/:id/status returns an object carrying zone_id, never an array (regression: 7284831)', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'UPDATE incidents']);
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const patched = await request(env.httpServer)
      .patch(`/api/incidents/${created.body.id}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    expect(Array.isArray(patched.body)).toBe(false);
    expect(patched.body).toMatchObject({
      id: created.body.id,
      status: 'in_progress',
      zone_id: SANTA_ELENA_ZONE_ID,
    });
  });

  // --- 5. Rate limiter identity (7284831) ---------------------------------
  // The guard keyed on an `x-device-uuid` header nothing in the codebase
  // sends; every identity fell through to the literal 'anonymous' and
  // shared one bucket, so one caller could exhaust the quota for everyone.
  it('two different authenticated users get independent rate-limit counters on the same route (regression: 7284831)', async () => {
    const userA = await env.provisionUser(['READ incidents']);
    const userB = await env.provisionUser(['READ incidents']);

    await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);

    const keys = await env.redisCache.keys('rate-limit:*');
    const keyA = keys.find((key) => key.includes(`user:${userA.userId}:`));
    const keyB = keys.find((key) => key.includes(`user:${userB.userId}:`));

    expect(keyA).toBeDefined();
    expect(keyB).toBeDefined();
    expect(keyA).not.toEqual(keyB);

    const countA = Number(await env.redisCache.get(keyA!));
    const countB = Number(await env.redisCache.get(keyB!));
    expect(countA).toBe(2);
    expect(countB).toBe(1);
  });

  // --- 6. Geofencing cache (7284831) --------------------------------------
  // buildZoneCacheKey/tagCacheKey/getCachedZoneByPoint were unit-tested and
  // never called from the write path; every incident write hit PostGIS
  // uncached. The cached path is now wired through resolveZone.
  it('populates a geo:point:* cache key on write (regression: 7284831)', async () => {
    const operator = await env.provisionUser(['CREATE incidents']);

    await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const keys = await env.redisCache.keys('geo:point:*');
    expect(keys.length).toBeGreaterThan(0);
  });

  // --- 7. Cross-database purge (7284831) ----------------------------------
  // Cached VALUES live on DB 1 (cache-manager); the tag-set lives on DB 0
  // (raw client). `redis.del(cachedKey)` targeted DB 0 and removed nothing
  // — the purge reported success while every stale entry survived. The old
  // by-name invalidation also never reached status-filtered listings.
  it('purges a status-filtered listing cache on write (regression: 7284831)', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'UPDATE incidents']);
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    await request(env.httpServer)
      .get('/api/incidents')
      .query({ zone_id: SANTA_ELENA_ZONE_ID, status: 'pending' })
      .set(auth)
      .expect(200);

    const listingKey = `incidents:list:${SANTA_ELENA_ZONE_ID}:pending`;
    expect(await env.redisCache.get(listingKey)).not.toBeNull();

    await request(env.httpServer)
      .patch(`/api/incidents/${created.body.id}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    expect(await env.redisCache.get(listingKey)).toBeNull();
  });

  // --- 8. RedisIoAdapter leak (d640339) -----------------------------------
  // Lifecycle concern — nothing in the HTTP/WS surface exercises a real
  // shutdown, so this is asserted at the narrowest honest level: construct
  // the adapter directly against the harness's own Redis container (not a
  // mock, unlike the existing unit spec) and prove close() actually
  // disconnects both extra ioredis clients instead of leaving them to retry
  // forever against a Redis that may already be gone.
  it('RedisIoAdapter disconnects its pub/sub Redis clients on close(), not just the socket.io server (regression: d640339)', async () => {
    const fakeAppContext = {
      get: (token: unknown) => {
        if (token === ConfigService) {
          return { get: () => ({ redisUrl: process.env.REDIS_URL }) } as unknown as ConfigService;
        }
        throw new Error(`unexpected token in fake app context: ${String(token)}`);
      },
    } as unknown as INestApplicationContext;

    const adapter = new RedisIoAdapter(fakeAppContext);
    const port = await getFreePort();
    // A non-zero port sidesteps IoAdapter's "attach to the app's own
    // httpServer" branch, which our fake context cannot satisfy — this
    // keeps the socket.io server this test spins up fully isolated from
    // `env`'s own already-listening server.
    const server = adapter.createIOServer(port);

    const pubClient = (adapter as unknown as { pubClient: Redis }).pubClient;
    const subClient = (adapter as unknown as { subClient: Redis }).subClient;

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(pubClient.status).not.toBe('end');
    expect(subClient.status).not.toBe('end');

    await adapter.close(server as Parameters<typeof adapter.close>[0]);
    // ioredis's disconnect() tears the socket down asynchronously — status
    // flips to 'end' via an event handler, not synchronously within the
    // disconnect() call itself.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(pubClient.status).toBe('end');
    expect(subClient.status).toBe('end');
  });

  // --- 9. Streams consumer shutdown (9dffec8) -----------------------------
  // Lifecycle concern — also asserted at the narrowest honest level: a
  // second, independent RealtimeStreamsConsumer against the harness's real
  // Redis, disconnected while parked in a real blocking XREADGROUP. Before
  // the fix, this logged "Streams consumer loop error: Connection is
  // closed." on every ordinary shutdown, making every deploy look like an
  // incident.
  it('a clean shutdown produces no error log even while blocked in a real XREADGROUP (regression: 9dffec8)', async () => {
    const consumerRedis = env.redisStreams.duplicate();
    const gatewayStub = { broadcast: jest.fn() } as unknown as EventsGateway;
    const consumer = new RealtimeStreamsConsumer(consumerRedis, gatewayStub);

    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    try {
      await consumer.onModuleInit();
      // Let the loop actually enter the blocking XREADGROUP call before we
      // pull the rug out from under it.
      await new Promise((resolve) => setTimeout(resolve, 250));

      consumer.onModuleDestroy();
      consumerRedis.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Streams consumer loop error'),
      );
    } finally {
      errorSpy.mockRestore();
      consumerRedis.disconnect();
    }
  });
});

function joinWithRetry(
  socket: Socket,
  room: string,
  attemptsLeft = 20,
): Promise<{ joined: boolean; room: string }> {
  return new Promise((resolve, reject) => {
    socket.emit('join', { room }, (ack: { joined: boolean; room: string }) => {
      if (ack.joined || attemptsLeft <= 0) {
        resolve(ack);
        return;
      }
      setTimeout(() => {
        joinWithRetry(socket, room, attemptsLeft - 1).then(resolve).catch(reject);
      }, 50);
    });
  });
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}
