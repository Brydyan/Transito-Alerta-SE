# Minimax Builder — Security Implementation Context

**Documento:** `MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md`  
**Date:** 2026-10-18  
**Status:** Ready for Implementation  
**Upstream:** `SECURITY_AUDIT_2026-10-18.md` + `SECURITY_ACTION_PLAN_2026-10-18.md`  
**For:** Minimax Builder Agent (sdd-apply equivalent)

---

## Preamble

**Sprint 0 completado:** 2 critical CVEs → 0, 25 high → 4 (via pnpm.overrides).  
**Restante:** Dependabot automático (semanal) cerrará los otros 25 vulns. Tu trabajo es **BATCHES 2-4** (runtime hardening + E2E security + medium-priority).

**Batches:**
- **BATCH 2** (P7-P8): Docker + CORS hardening — 1h, 1 PR
- **BATCH 3** (P9-P12): E2E security tests — 8h, 1-2 PRs
- **BATCH 4** (P13-P17): Medium priority (optional, low-risk) — 5-8h

---

## Execution Model

- **No SDD formal** — spec está en este doc (qué/dónde/cómo/validación)
- **1 PR per batch** (no squash, cada item es 1 commit)
- **Order matters:** BATCH 2 bloquea BATCH 3 (tests deben pasar)
- **RTK prefix:** usa `rtk <cmd>` para todos los comandos (ver CLAUDE.md)
- **Conventional commits:** no co-author, solo tu firma

---

## BATCH 2: Docker + CORS (1h, 1 PR)

### [P7] USER node en backend/Dockerfile

**File:** `backend/Dockerfile`  
**Current state (lines 31-40):**
```dockerfile
FROM node:22-alpine AS production
WORKDIR /app/backend
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile --prod
COPY --from=build /app/backend/dist /app/backend/dist
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
```

**Required change (add 2 lines before CMD):**
```dockerfile
FROM node:22-alpine AS production
WORKDIR /app/backend
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile --prod
COPY --from=build /app/backend/dist /app/backend/dist
RUN addgroup -g 1000 -S app && adduser -u 1000 -S app -G app
USER app
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
```

**Validation:**
```bash
docker compose up --build backend
docker exec tase-backend whoami
# Must print: app (NOT root)

curl http://localhost:3001/api/health
# Must return 200 OK
```

**Commit message:**
```
chore(docker): add USER app to backend Dockerfile for non-root execution

- Add RUN addgroup/adduser (gid/uid 1000, app)
- Set USER app before CMD
- Prevents privilege escalation if process is compromised
```

---

### [P8] CORS — fix default from `true` to whitelist

**File:** `backend/src/main.ts`  
**Current state (lines 70-73):**
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true,
});
```

**Problem:** `?? true` = ANY origin if `CORS_ORIGIN` env not set. Vulnerable to token leakage.

**Required replacement (lines 70-85):**
```typescript
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!allowedOrigins.length && process.env.NODE_ENV === 'production') {
  throw new Error(
    'CORS_ALLOWED_ORIGINS must be set (comma-separated list) in production',
  );
}

app.enableCors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

**File:** `.env.example`  
**Add (if not exists):**
```env
# CORS: Comma-separated list of allowed origins.
# Required in production. Blank = deny all (safe for local dev).
# Example: http://localhost:4200,https://app.transito-alerta.example
CORS_ALLOWED_ORIGINS=
```

**Validation:**

1. Dev mode (CORS_ALLOWED_ORIGINS unset):
```bash
# Origin denial is safe, tests should pass
rtk jest
# 1501 passed, 0 failed
```

2. Local browser test:
```bash
# In frontend .env or hardcode: API_URL=http://localhost:3001/api
# Requests from frontend should work (same-origin or whitelisted)

# Curl from wrong origin (not whitelisted):
curl -H "Origin: http://malicious.com" http://localhost:3001/api/health
# Must NOT include Access-Control-Allow-Origin header (blocked)
```

**Commit message:**
```
chore(cors): restrict CORS to explicit whitelist, require env var in production

- Change origin from `true` (wildcard) to whitelist model
- Add CORS_ALLOWED_ORIGINS env var (required in prod, blank=safe default in dev)
- Prevent token leakage via cross-origin reads
- Add validation: throw in production if CORS_ALLOWED_ORIGINS empty
```

---

## BATCH 3: E2E Security Tests (8h, 1-2 PRs)

### [P9] SQL Injection E2E Tests

**File:** `backend/test/e2e/security-sql-injection.e2e-spec.ts` (create)  
**Framework:** Supertest + Jest  
**Vectors:** 5 classic SQLi patterns

**Template:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Security: SQL Injection (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const SQL_INJECTION_VECTORS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT NULL, NULL, NULL--",
    "admin'--",
    "1 OR 1=1",
  ];

  describe.each(SQL_INJECTION_VECTORS)('Vector: %s', (vector) => {
    it('POST /auth/login rejects SQLi payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: `${vector}@test.com`,
          password: vector,
        });

      // 401 (auth fails) or 400 (validation rejects) — never 500
      expect([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED]).toContain(
        res.status,
      );
      expect(res.body).not.toHaveProperty('access_token');
    });

    it('GET /api/incidents?status=X handles SQLi without error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/incidents')
        .query({ status: vector });

      // 200 (empty result) or 400 (validation) — never 500
      expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(res.status);
    });

    it('GET /api/incidents/search?q=X handles SQLi without error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/incidents/search')
        .query({ q: vector });

      expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(res.status);
    });
  });
});
```

**Validation:**
```bash
rtk jest backend/test/e2e/security-sql-injection.e2e-spec.ts
# All must pass (no 500 errors on any vector)
```

**Commit message:**
```
test(security): add SQL injection E2E test vectors (5 classic patterns)

- Test POST /auth/login, GET /incidents, GET /incidents/search
- Verify 400/401 (fail validation or auth), never 500
- Defense-in-depth: TypeORM parametrizes by default, this verifies
```

---

### [P10] JWT Tampering E2E Tests

**File:** `backend/test/e2e/security-jwt-tampering.e2e-spec.ts` (create)  
**Vectors:** alg=none, wrong secret, wrong typ, expired token

**Template:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';

describe('Security: JWT Tampering (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Token validation', () => {
    it('rejects token with alg=none', async () => {
      const noneAlg = jwt.sign({ sub: 'u-test', typ: 'access' }, '', {
        algorithm: 'none',
      });

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${noneAlg}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects token signed with wrong secret', async () => {
      const wrongSecret = jwt.sign(
        { sub: 'u-test', typ: 'access' },
        'wrong-secret-123',
      );

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${wrongSecret}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects refresh token used as access token', async () => {
      // Simular refresh token con typ=refresh
      const refreshToken = jwt.sign(
        { sub: 'u-test', typ: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      );

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects expired access token', async () => {
      const expired = jwt.sign(
        {
          sub: 'u-test',
          typ: 'access',
          exp: Math.floor(Date.now() / 1000) - 60, // 60s ago
        },
        process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
      );

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expired}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});
```

**Validation:**
```bash
rtk jest backend/test/e2e/security-jwt-tampering.e2e-spec.ts
# All must pass (401 on all tampering attempts)
```

**Commit message:**
```
test(security): add JWT tampering E2E tests (alg=none, wrong secret, wrong typ, expired)

- Verify JwtStrategy rejects all forged/tampered tokens with 401
- Test vectors: alg=none, different secret, refresh-as-access, expired
```

---

### [P11] Rate Limit Bypass E2E Tests

**File:** `backend/test/e2e/security-rate-limit.e2e-spec.ts` (create)  
**Vectors:** exceed limit, per-user isolation, IPv4-mapped IPv6 spoofing

**Template:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Security: Rate Limit (E2E)', () => {
  let app: INestApplication;
  const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 when exceeding rate limit on /auth/login', async () => {
    let lastStatus = HttpStatus.OK;

    // Send MAX_REQUESTS + 1 requests
    for (let i = 0; i <= MAX_REQUESTS; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: `test-${i}@example.com`,
          password: 'wrong-password',
        });
      lastStatus = res.status;
    }

    // Last request should be 429
    expect(lastStatus).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('isolates rate limit per user (different users have separate buckets)', async () => {
    const user1Max = MAX_REQUESTS;
    const user2Max = MAX_REQUESTS;

    let user1LastStatus = HttpStatus.OK;
    let user2LastStatus = HttpStatus.OK;

    // Exhaust user1 quota
    for (let i = 0; i <= user1Max; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user1@example.com',
          password: 'wrong',
        });
      user1LastStatus = res.status;
    }

    // User2 should still have quota (separate bucket)
    const user2Req = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'user2@example.com',
        password: 'wrong',
      });
    user2LastStatus = user2Req.status;

    expect(user1LastStatus).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(user2LastStatus).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('rate limit not bypassable via IPv4-mapped IPv6 spoofing (proxy-addr fix)', async () => {
    const MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    let lastStatus = HttpStatus.OK;

    const spoofedIp = '::ffff:127.0.0.1';

    // Try to bypass with spoofed IP
    for (let i = 0; i <= MAX; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', spoofedIp)
        .send({
          email: 'spooftest@example.com',
          password: 'wrong',
        });
      lastStatus = res.status;
    }

    // Rate limiter should still block (proxy-addr is patched)
    expect(lastStatus).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
```

**Validation:**
```bash
rtk jest backend/test/e2e/security-rate-limit.e2e-spec.ts
# All must pass (429 after limit, per-user isolation, no bypass)
```

**Commit message:**
```
test(security): add rate limit E2E tests (limit enforcement, per-user isolation, spoofing)

- Verify 429 after MAX_REQUESTS requests
- Verify per-user/IP isolation (separate buckets)
- Verify IPv4-mapped IPv6 spoofing doesn't bypass (proxy-addr patched)
```

---

### [P12] PII Logging Audit

**File:** `backend/src/shared/observability/request-id.logger.ts`  
**Action:** Verify + add redaction filter if missing

**Check:**
```bash
# Find all password/token references in logging code
rtk grep -rE "password|token|secret|refresh_token" backend/src/shared/observability/ --include="*.ts" | grep -v ".spec.ts"

# Check RequestIdLogger
rtk head -150 backend/src/shared/observability/request-id.logger.ts
```

**If redaction missing, add (example):**
```typescript
// backend/src/shared/observability/request-id.logger.ts

private readonly REDACTED_FIELDS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
];

private redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body as Record<string, unknown> };
  for (const key of this.REDACTED_FIELDS) {
    if (key in out) {
      out[key] = '[REDACTED]';
    }
  }
  return out;
}

// Call in the logger method where body is logged:
// this.log(this.redactBody(request.body), ...);
```

**Validation:**
```bash
# Send a POST with sensitive data and verify logs don't leak
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"leaked123"}'

# Check backend logs
docker compose logs backend | grep -i password
# Should show: password: [REDACTED] (NOT "leaked123")
```

**Commit message (if changes needed):**
```
chore(observability): add PII redaction filter to request logger

- Redact password, token, refresh_token, authorization, secret
- Prevent accidental logging of sensitive user data in request bodies
- Applies to RequestIdLogger for all HTTP requests
```

**OR (if already OK):**
```
docs(security): verify PII logging audit (password redaction present)

- Confirmed RequestIdLogger redacts sensitive fields
- No changes needed: implementation is correct
```

---

## BATCH 4: Medium Priority (5-8h, optional, 1-2 PRs)

### [P13] Coverage: branches → 75% (from 60%)

**Action:** Analyze coverage report and add missing branch tests

```bash
rtk jest --coverage backend/test/unit
# Open coverage/coverage-final.json, focus on branches < 60%

# Top targets:
# - backend/src/main.ts (0% coverage)
# - backend/src/app.module.ts (0%)
# - backend/src/modules/*/services/*.ts (validation error paths)
```

**Approach:**
- Write specs for uncovered branches (error cases, ternary ops, short-circuit logic)
- Ignore try/catch around DB ops (hard to test without integration DB)

**Commit message:**
```
test(coverage): raise branch coverage 60% → 75%

- Add tests for error paths in auth service
- Cover validation branch in main.ts bootstrap
- Target: branches ≥75% for security-critical modules
```

---

### [P14] JWT Key Rotation (kid header + multi-key validation)

**Action:** Implement key versioning (kid)

```typescript
// backend/src/config/auth.config.ts
export const JWT_KEYS = {
  'k1': process.env.JWT_ACCESS_SECRET_K1,  // old key
  'k2': process.env.JWT_ACCESS_SECRET_K2,  // new key (current)
};

// backend/src/modules/auth/strategies/jwt.strategy.ts
// Modify JwtService.verify() to try all keys (fallback from new to old)
// Until old tokens expire (15 min TTL), both keys are valid
```

**Commit message:**
```
feat(auth): implement JWT key rotation with kid header versioning

- Add JWT_ACCESS_SECRET_K1 (old), JWT_ACCESS_SECRET_K2 (new) to .env
- Modify JwtStrategy to validate against all kid versions
- New tokens signed with k2, old tokens still work until 15min TTL expires
- After 7 days, remove k1 from config
```

---

### [P15] PostgreSQL Backups (pg_dump + cron)

**Action:** Create backup script + cron entry

```bash
# Create database/scripts/backup.sh
cat > database/scripts/backup.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR=/var/backups/transito-alerta
mkdir -p "$BACKUP_DIR"

docker exec tase-postgres pg_dump \
  -U postgres -d transito_alerta \
  -Fc --no-owner --no-acl \
  > "$BACKUP_DIR/db-$TIMESTAMP.dump"

# Retention: delete backups older than 30 days
find "$BACKUP_DIR" -name "db-*.dump" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db-$TIMESTAMP.dump"
EOF

chmod +x database/scripts/backup.sh

# Add to cron (as root or via systemd):
# 0 2 * * * /path/to/database/scripts/backup.sh >> /var/log/backup.log 2>&1
```

**Commit message:**
```
ops(database): add automated PostgreSQL backups (daily, 30-day retention)

- Create database/scripts/backup.sh (pg_dump to /var/backups)
- Retention: 7 daily, 4 weekly, 6 monthly
- Document cron entry for daily 02:00 UTC backup
```

---

### [P16] Stricter Rate Limit on `/auth/login`

**Action:** Add CPU-exhaustion defense (bcrypt DoS)

```typescript
// backend/src/shared/guards/rate-limiter.guard.ts

const STRICTER_LIMIT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password-reset',
];

async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const route = request.path ?? request.url ?? 'unknown';
  const identity = this.resolveIdentity(request);

  const { rateLimit } = this.configService.get<CacheConfig>('cache')!;
  const key = buildRateLimitKey(identity, route);
  const current = (await this.cache.get<number>(key)) ?? 0;

  // Stricter limit for CPU-intensive endpoints
  const maxRequests = STRICTER_LIMIT_PATHS.includes(route)
    ? (rateLimit.strictMaxRequests ?? 10)
    : rateLimit.maxRequests;

  if (current >= maxRequests) {
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  await this.cache.set(key, current + 1, rateLimit.windowSeconds * 1000);
  return true;
}
```

**`.env.example`:**
```env
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_STRICT_MAX_REQUESTS=10  # for /auth/login, /auth/register, /auth/password-reset
```

**Commit message:**
```
chore(auth): add stricter rate limit for CPU-bound endpoints (/auth/login)

- Default global: 100 req/min per user/IP
- Auth endpoints: 10 req/min (bcrypt cost 12 = ~250ms per attempt)
- Prevents CPU exhaustion DoS on password-based endpoints
```

---

### [P17] Helmet Headers: CSP, HSTS, Referrer-Policy

**Action:** Audit + tighten helmet config in `backend/src/main.ts`

```typescript
// Current line 65-67:
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// Required expansion:
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      scriptSrc: [`'self'`, `'unsafe-inline'`], // Angular requires unsafe-inline
      styleSrc: [`'self'`, `'unsafe-inline'`],
      imgSrc: [`'self'`, 'data:', 'https:'],
      connectSrc: [`'self'`, 'wss:', 'https:'],
      objectSrc: [`'none'`],
      frameAncestors: [`'none'`],
    },
  },
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: false,
}));
```

**Validation:**
```bash
curl -I http://localhost:3001/api/health | grep -iE "strict-transport|content-security|referrer"
# Should see all 3 headers
```

**Commit message:**
```
chore(security): audit + expand helmet CSP, HSTS, referrer-policy headers

- CSP: whitelist sources (self, unsafe-inline for Angular, data: for images)
- HSTS: 1 year max-age, include subdomains, preload
- Referrer-Policy: strict-origin-when-cross-origin
- Prevents XSS, clickjacking, information leakage
```

---

## Success Criteria

### BATCH 2
- ✅ Docker build succeeds
- ✅ `docker exec tase-backend whoami` = `app`
- ✅ Backend listens on :3001
- ✅ CORS blocks non-whitelisted origins
- ✅ Frontend requests work (same-origin)

### BATCH 3
- ✅ All E2E security test suites pass (no 500 errors on payloads)
- ✅ SQL injection vectors don't bypass validation
- ✅ JWT tampering attempts return 401
- ✅ Rate limit blocks after threshold
- ✅ PII (passwords, tokens) never appear in logs

### BATCH 4
- ✅ Branch coverage ≥75%
- ✅ JWT key rotation tested (old + new keys valid)
- ✅ Backup script runs without error
- ✅ Rate limit stricter on `/auth/login`
- ✅ Helmet CSP + HSTS + Referrer-Policy headers present

---

## Rollback Strategy

Each batch is **independently reversible**:

```bash
# Revert BATCH 2
git revert <P7-commit> <P8-commit>

# Revert BATCH 3
git revert <P9-commit> <P10-commit> <P11-commit> <P12-commit>

# etc.
```

---

## Notes

- **RTK prefix required:** `rtk jest`, `rtk docker`, `rtk curl`, etc.
- **No AI co-author:** conventional commits, your signature only
- **One logical change per commit:** P7 = 1 commit, P8 = 1 commit, etc.
- **Tests first, then code:** write test assertions before fixing code
- **Dependabot will auto-PR** remaining CVEs (23 moderate, 2 low) — no manual action needed
