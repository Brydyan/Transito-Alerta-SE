import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client, Pool } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import type { Cache } from 'cache-manager';
import type { RedisStore } from 'cache-manager-redis-yet';

import { AppModule } from '../../src/app.module';
import { SnakeCaseResponseInterceptor } from '../../src/common/interceptors/snake-case-response.interceptor';
import { RedisIoAdapter } from '../../src/modules/realtime/redis-io.adapter';
import { PasswordHasher } from '../../src/modules/auth/password-hasher';
import helmet from 'helmet';
import {
  MAIL_BLOCKING_CLIENT,
  MAIL_EVENTS_BLOCKING_CLIENT,
  REDIS_CLIENT,
  SESSION_REDIS_CLIENT,
} from '../../src/core/core.module';
import { applyMigrations } from './run-migrations';

export interface ProvisionedUser {
  userId: string;
  deviceUuid: string;
  accessToken: string;
  refreshToken: string;
  permissions: string[];
  /** T3.9 — the session id (`user_sessions.id`), null for anonymous. */
  sid: string | null;
}

/** T3.2 D13 — organization/role overrides for tenant-isolation e2e fixtures. */
export interface ProvisionUserOverrides {
  deviceUuid?: string;
  email?: string;
  organizationId?: string | null;
  roleName?: string;
}

const ANONYMOUS_PERMISSIONS_JSON =
  '["READ incidents","CREATE incidents","READ comments","CREATE comments"]';

/**
 * TestEnvironment — the real stack for e2e tests, not a mocked one.
 *
 * Starts Postgres+PostGIS and Redis in Testcontainers, builds the schema by
 * applying `database/migrations/[0-9]*.sql` in numeric order (never
 * TypeORM `synchronize`, which stays false everywhere — CC3), then
 * bootstraps the Nest app with the exact same pipeline as
 * `backend/src/main.ts` (global prefix, ValidationPipe,
 * SnakeCaseResponseInterceptor, RedisIoAdapter) so casing, validation and
 * routing behave identically to production — this is what makes the
 * harness worth more than the mocked unit seams that let seven defects
 * ship in Phases 1-2.
 *
 * One instance per spec file: call `TestEnvironment.start()` in
 * `beforeAll`, `env.stop()` in `afterAll`. Each file pays its own
 * container-startup cost — there is no cross-file container reuse.
 * Testcontainers' Ryuk reaper ties container lifetime to the Node process
 * that started them, and Jest gives each spec file its own worker process;
 * sharing one set of containers across files would need a
 * globalSetup/globalTeardown split with Ryuk disabled plus a hand-rolled
 * coordination file. Not worth the complexity for the handful of e2e files
 * Phase 4 will add — revisit if that assumption stops holding.
 */
export class TestEnvironment {
  private constructor(
    readonly app: INestApplication,
    readonly httpServer: ReturnType<INestApplication['getHttpServer']>,
    readonly pg: Pool,
    /** Cache DB (1) — same logical database CacheModule/AuthService use. */
    readonly redisCache: Redis,
    /** Streams DB (0) — same logical database `incidents:events` lives on. */
    readonly redisStreams: Redis,
    private readonly postgresContainer: StartedTestContainer,
    private readonly redisContainer: StartedTestContainer,
    private readonly appRedisClient: Redis,
    private readonly cacheManager: Cache<RedisStore>,
    private readonly mailBlockingClient: Redis,
    private readonly mailEventsBlockingClient: Redis,
    private readonly sessionRedisClient: Redis,
  ) {}

  static async start(): Promise<TestEnvironment> {
    const postgresContainer = await new GenericContainer('postgis/postgis:16-3.4')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: 'transito_alerta_test',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
      })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60_000)
      .start();

    const redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .withStartupTimeout(30_000)
      .start();

    const dbHost = postgresContainer.getHost();
    const dbPort = postgresContainer.getMappedPort(5432);
    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);

    const migrationClient = new Client({
      host: dbHost,
      port: dbPort,
      user: 'postgres',
      password: 'postgres',
      database: 'transito_alerta_test',
    });
    await migrationClient.connect();
    await applyMigrations(migrationClient);
    await migrationClient.end();

    // CoreModule's registerAs factories (database/auth/cache config) read
    // process.env when Nest instantiates them below — they must be set
    // before Test.createTestingModule(...).compile(), not before importing
    // AppModule (the import above only registers class metadata, it does
    // not invoke the factories).
    delete process.env.DATABASE_URL; // would otherwise override host/port/user below
    process.env.DB_HOST = dbHost;
    process.env.DB_PORT = String(dbPort);
    process.env.DB_NAME = 'transito_alerta_test';
    // database.config.ts reads DB_USERNAME. backend/.env ships DB_USER
    // instead — a real name drift between the two, invisible today only
    // because both resolve to 'postgres'. Set both so this harness keeps
    // working if either the code or the .env file is fixed later without
    // the other changing in lockstep.
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_SSL = 'false';

    process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
    process.env.REDIS_CACHE_DB = '1';
    process.env.REDIS_STREAMS_DB = '0';

    process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
    process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    // T3.6 — bcrypt cost is config-driven (AuthConfig.bcryptCost); the
    // production default (12) is deliberately expensive. Every e2e spec
    // file boots one shared AppModule, so shrinking this here (not per-file)
    // keeps password-identity scenarios (invitations, password-reset,
    // change-password) fast without ever hardcoding a low cost in service
    // code (design "Testing Strategy": cost 4 in tests, never a literal).
    process.env.BCRYPT_COST = '4';

    // A high ceiling — RateLimiterGuard is not what these flows exercise,
    // and the default 100 req/min shared across a growing e2e suite would
    // make failures depend on how many requests earlier tests happened to
    // make.
    process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
    process.env.CACHE_TTL_SECONDS = '60';
    process.env.GEOFENCING_CACHE_TTL_SECONDS = '60';

    // MailModule always loads (AppModule) — shrink the sweep/idle windows
    // so mail.e2e-spec.ts's retry scenario doesn't wait out the 10s/30s
    // production defaults, without faking timers around real Redis I/O.
    process.env.MAIL_SWEEP_INTERVAL_MS = '300';
    process.env.MAIL_CLAIM_IDLE_MS = '500';
    // XREADGROUP BLOCK timeout: 1s in tests (vs 5s prod) so entries
    // enqueued between loop calls are seen within ~1s, not ~5s (which gives
    // sweep time to intercept and exhaust).
    process.env.MAIL_XREADGROUP_BLOCK_MS = '1000';

    // StatusHistoryModule always loads (AppModule) — same shrink rationale
    // as Mail's tunables above (design D2): fast sweep/idle windows so the
    // e2e idempotency/redelivery scenarios don't wait out the 10s/30s
    // production defaults.
    process.env.STATUS_HISTORY_XREADGROUP_BLOCK_MS = '1000';
    process.env.STATUS_HISTORY_SWEEP_INTERVAL_MS = '300';
    process.env.STATUS_HISTORY_CLAIM_IDLE_MS = '500';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();

    // Mirror backend/src/main.ts exactly, in the same order, so this
    // harness proves the real wiring (casing, validation, prefix, WS
    // adapter) and not just handler logic in isolation.
    app.useWebSocketAdapter(new RedisIoAdapter(app));
    // T4.3a — keep the harness in lockstep with main.ts so security-headers
    // e2e assertions see what production sees.
    app.use(helmet());
    app.setGlobalPrefix('api');
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new SnakeCaseResponseInterceptor());

    // listen(0) on an ephemeral port — not app.init() — because
    // RedisIoAdapter.createIOServer only binds once a real HTTP server is
    // listening; app.init() alone would leave the socket.io server never
    // constructed, silently diverging from main.ts.
    await app.listen(0);

    const appRedisClient = app.get<Redis>(REDIS_CLIENT);
    const cacheManager = app.get<Cache<RedisStore>>(CACHE_MANAGER);
    // MailOutboxConsumer / IncidentMailListener each park a blocking
    // XREADGROUP on their own dedicated connection (design D13) — same
    // reasoning as appRedisClient below: without a forced disconnect() at
    // teardown, app.close() waits out their BLOCK window on every spec
    // file that boots AppModule (every e2e file, since MailModule is
    // wired in globally).
    const mailBlockingClient = app.get<Redis>(MAIL_BLOCKING_CLIENT);
    const mailEventsBlockingClient = app.get<Redis>(MAIL_EVENTS_BLOCKING_CLIENT);
    // T3.9 — the denylist/grace-buffer client. Same DB (0) as REDIS_CLIENT,
    // but a SEPARATE connection (`enableOfflineQueue: false,
    // commandTimeout: 50`) — grabbed here only so teardown can quit it
    // cleanly; tests read/write session keys through `env.redisStreams`
    // (same logical database) rather than this handle directly.
    const sessionRedisClient = app.get<Redis>(SESSION_REDIS_CLIENT);

    const pg = new Pool({
      host: dbHost,
      port: dbPort,
      user: 'postgres',
      password: 'postgres',
      database: 'transito_alerta_test',
    });

    // Deliberately separate connections from the app's own REDIS_CLIENT —
    // that one has RealtimeStreamsConsumer permanently parked inside
    // `XREADGROUP ... BLOCK 5000` (design D5), and sharing a connection
    // with a blocking command queues every other command behind it for up
    // to the block window.
    const redisStreams = new Redis({ host: redisHost, port: redisPort, db: 0 });
    const redisCache = new Redis({ host: redisHost, port: redisPort, db: 1 });

    return new TestEnvironment(
      app,
      app.getHttpServer(),
      pg,
      redisCache,
      redisStreams,
      postgresContainer,
      redisContainer,
      appRedisClient,
      cacheManager,
      mailBlockingClient,
      mailEventsBlockingClient,
      sessionRedisClient,
    );
  }

  /**
   * Clears mutable per-test data so ordering cannot matter. Deliberately
   * leaves `geo_zones`/`roles`/`organizations` seed rows untouched — those
   * are fixtures the migrations planted, not state a test produced, and
   * wiping the Santa Elena polygon on every reset would break every
   * geofencing-dependent flow this harness is meant to unlock next.
   */
  async reset(): Promise<void> {
    await this.pg.query(
      'TRUNCATE TABLE notifications, assignments, comments, status_history, incidents, incident_categories, user_sessions, users RESTART IDENTITY CASCADE',
    );
    // 0001's anonymous seed row (ON CONFLICT DO NOTHING) only helps if the
    // row already exists — the TRUNCATE above just removed it, and every
    // subsequent login('anonymous') call depends on it being there.
    await this.pg.query(
      `INSERT INTO users (device_uuid, permissions, is_active)
       VALUES ('anonymous', $1::jsonb, true)`,
      [ANONYMOUS_PERMISSIONS_JSON],
    );
    await this.redisCache.flushdb();
    // NOT redisStreams.flushdb() — that would delete the `incidents:events`
    // stream and the `realtime` consumer group RealtimeStreamsConsumer
    // creates once at boot; nothing recreates it after startup.

    // Clear mail streams (entries only, NOT consumer groups) so each test
    // starts clean. MAXLEN 0 deletes all entries but preserves the stream
    // and any consumer groups already registered on it, preventing NOGROUP
    // errors when MailOutboxConsumer.loop() tries to XREADGROUP.
    try {
      await this.redisStreams.xtrim('mail:outbox', 'MAXLEN', '~', '0');
    } catch {
      // Stream doesn't exist yet (first test run) — expected.
    }
    try {
      await this.redisStreams.xtrim('mail:dead', 'MAXLEN', '~', '0');
    } catch {
      // Stream doesn't exist yet — expected.
    }
  }

  /**
   * Provisions an operator-style user with an arbitrary permission set,
   * directly in this test's own throwaway database — never a shared or
   * developer database. Logs in through the real `/api/auth/login` route
   * rather than hand-signing a JWT, so the returned token always matches
   * whatever AuthService actually signs (secret, claims, expiry) instead of
   * a second implementation that could drift from it.
   *
   * T3.2 D13: `organizationId`/`roleName` overrides insert `organization_id`
   * and a `role_id` (looked up by name against the 0015-seeded roles)
   * directly — never through the HTTP API, so every tenant-isolation test
   * does not depend on the correctness of the authorization code under
   * test. `permissions` stays an explicit, independent parameter (existing
   * convention) — it is NOT derived from `roleName` here.
   */
  async provisionUser(
    permissions: string[],
    overrides: ProvisionUserOverrides = {},
  ): Promise<ProvisionedUser> {
    const deviceUuid = overrides.deviceUuid ?? `operator-${randomUUID()}`;

    let roleId: string | null = null;
    if (overrides.roleName) {
      const { rows } = await this.pg.query<{ id: string }>(
        'SELECT id FROM roles WHERE name = $1',
        [overrides.roleName],
      );
      roleId = rows[0]?.id ?? null;
    }

    await this.pg.query(
      `INSERT INTO users (device_uuid, permissions, is_active, email, organization_id, role_id)
       VALUES ($1, $2::jsonb, true, $3, $4, $5)`,
      [
        deviceUuid,
        JSON.stringify(permissions),
        overrides.email ?? null,
        overrides.organizationId ?? null,
        roleId,
      ],
    );

    const response = await request(this.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: deviceUuid })
      .expect(200);

    const { rows } = await this.pg.query<{ id: string }>(
      'SELECT id FROM users WHERE device_uuid = $1',
      [deviceUuid],
    );
    const userId = rows[0].id;

    // T3.9 — every non-anonymous login writes exactly one `user_sessions`
    // row synchronously (D2); the most recent one for this user is the one
    // this exact login() call just created.
    const { rows: sessionRows } = await this.pg.query<{ id: string }>(
      'SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );

    return {
      userId,
      deviceUuid,
      accessToken: response.body.access_token as string,
      refreshToken: response.body.refresh_token as string,
      permissions: response.body.permissions as string[],
      sid: sessionRows[0]?.id ?? null,
    };
  }

  /**
   * T3.9 (task 7.8) — directly revokes a session row AND writes the
   * denylist entry (mirroring what `AuthService.revokeSession` does), for
   * tests that need a revoked state set up without going through
   * `POST /auth/logout` / `DELETE /api/sessions/:id`.
   */
  async revokeSession(sessionId: string): Promise<void> {
    const { rows } = await this.pg.query<{ expires_at: Date | null }>(
      `UPDATE user_sessions SET revoked_at = now() WHERE id = $1 RETURNING expires_at`,
      [sessionId],
    );
    const expiresAt = rows[0]?.expires_at;
    const ttlSeconds = expiresAt
      ? Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
      : 60;
    await this.redisStreams.setex(`sess:revoked:${sessionId}`, ttlSeconds, '1');
  }

  /**
   * T3.9 (task 7.8) — backdates `rotated_at` so grace-window boundary e2e
   * scenarios don't need a real sleep (design §10: "Time is injected,
   * never slept" — the DB clock cannot be injected from Node, so the row
   * is backdated instead). Also clears any grace-buffer key for this
   * session, since the buffer must expire together with the window it
   * represents.
   */
  async backdateRotation(sessionId: string, secondsAgo: number): Promise<void> {
    await this.pg.query(
      `UPDATE user_sessions SET rotated_at = now() - ($2 || ' seconds')::interval WHERE id = $1`,
      [sessionId, String(secondsAgo)],
    );
    const keys = await this.redisStreams.keys(`sess:grace:${sessionId}:*`);
    if (keys.length > 0) {
      await this.redisStreams.del(...keys);
    }
  }

  /**
   * T3.6 (task 8.18) — provisions a password-identity user directly (no
   * invitation redemption involved), for scenarios that need a ready-made
   * password login (password-reset, `PUT /auth/password`) without the
   * accept-invitation flow itself being under test. Hashes through the
   * app's own `PasswordHasher` instance (cost resolved from
   * `AuthConfig.bcryptCost`, `BCRYPT_COST=4` in this harness — see
   * `start()`), so `bcrypt.compare` inside `AuthService.loginWithPassword`
   * succeeds against it exactly as it would for a real accept-invitation
   * row.
   */
  async provisionPasswordUser(
    email: string,
    password: string,
    overrides: { permissions?: string[]; roleName?: string; organizationId?: string | null } = {},
  ): Promise<{ userId: string }> {
    const passwordHasher = this.app.get(PasswordHasher);
    const passwordHash = await passwordHasher.hash(password);

    let roleId: string | null = null;
    if (overrides.roleName) {
      const { rows } = await this.pg.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [
        overrides.roleName,
      ]);
      roleId = rows[0]?.id ?? null;
    }

    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, permissions, is_active, organization_id, role_id)
       VALUES ($1, $2, $3::jsonb, true, $4, $5)
       RETURNING id`,
      [
        email,
        passwordHash,
        JSON.stringify(overrides.permissions ?? []),
        overrides.organizationId ?? null,
        roleId,
      ],
    );
    return { userId: rows[0].id };
  }

  /**
   * T3.6 (task 8.18/8.12) — backdates an `invitations` row's `expires_at`
   * directly via SQL `UPDATE`, never `sleep`/clock injection (house rule,
   * design "Testing Strategy": "the intervals are 24h/48h").
   */
  async backdateInvitation(id: string, secondsAgo: number): Promise<void> {
    await this.pg.query(
      `UPDATE invitations SET expires_at = now() - ($2 || ' seconds')::interval WHERE id = $1`,
      [id, String(secondsAgo)],
    );
  }

  /** Same shape as {@link backdateInvitation}, for `password_reset_tokens`. */
  async backdateResetToken(id: string, secondsAgo: number): Promise<void> {
    await this.pg.query(
      `UPDATE password_reset_tokens SET expires_at = now() - ($2 || ' seconds')::interval WHERE id = $1`,
      [id, String(secondsAgo)],
    );
  }

  async stop(): Promise<void> {
    // AuthService.login + MailOutboxConsumer/IncidentMailListener sweep timers emit
    // fire-and-forget — they are not awaited — so listeners can still be mid-write
    // when the HTTP response returns. MailOutboxConsumer.sweep runs every 300ms in
    // test; give 2 cycles for final retry/dead-letter operations to complete.
    await new Promise((resolve) => setTimeout(resolve, 800));

    // cache-manager-redis-yet (node-redis under the hood, not ioredis)
    // keeps its client open with auto-reconnect after app.close() unless
    // quit explicitly — otherwise it survives the container being stopped
    // below and throws an unhandled "Socket closed unexpectedly" error
    // that fails the whole Jest run even though every test already passed.
    await this.cacheManager.store.client.quit().catch(() => undefined);

    await this.pg.end();
    await this.redisCache.quit().catch(() => undefined);
    await this.redisStreams.quit().catch(() => undefined);

    // Supertest's requests use HTTP keep-alive; Node's http.Server holds an
    // idle keep-alive socket open for up to `keepAliveTimeout` (5s default)
    // afterwards. app.close() waits for every open connection to end on its
    // own before its promise resolves, so without this the whole harness
    // stalls for that window (or longer, empirically observed here) on
    // every single spec file. closeAllConnections() (Node >=18.2) forces
    // them shut immediately instead of waiting them out.
    this.httpServer.closeAllConnections();
    await this.app.close();

    // RealtimeStreamsConsumer's loop is parked inside a 5s-BLOCK
    // XREADGROUP on this same connection (design D5). app.close() flips
    // its `running` flag via onModuleDestroy but cannot interrupt an
    // in-flight blocking command — disconnecting here forces that command
    // to error immediately so the loop notices `running === false` and
    // exits within milliseconds instead of Jest waiting out the block
    // window on every single spec file.
    this.appRedisClient.disconnect();
    this.mailBlockingClient.disconnect();
    this.mailEventsBlockingClient.disconnect();
    this.sessionRedisClient.disconnect();

    await this.redisContainer.stop();
    await this.postgresContainer.stop();
  }
}
