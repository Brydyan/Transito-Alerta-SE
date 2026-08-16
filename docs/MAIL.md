# Mail module (T3.5)

Durable, non-blocking SMTP email delivery via Redis Streams. Source of
truth: `sdd/T3.5-mail/spec`, `sdd/T3.5-mail/design` (decisions D8-D13),
`sdd/T3.5-mail/tasks`. Satisfies R13 (Mail) and contributes to R9
(notification resilience).

Mail is a **transport, not a domain**: no controller, no HTTP surface, no
entity of its own. It owns two consumers and one service, all under
`backend/src/modules/mail/`.

## Architecture

```
Invitations / other producers ──enqueue()──┐
                                            ├─→ XADD mail:outbox
incidents:events ─group:mail─→ IncidentMailListener ┘
       │
       └─→ MailOutboxConsumer (XREADGROUP BLOCK 5000, dedicated conn)
             ├─ render (escaped HTML) ─→ nodemailer SMTP ─→ XACK
             └─ fail ─→ pending ─→ XPENDING/XCLAIM sweep (10s, idle 30s)
                          └─ 3 attempts ─→ XADD mail:dead + XACK
```

### D8 — two consumers, one module
- `MailOutboxConsumer` — consumer group `mail` on `mail:outbox`. Delivers.
- `IncidentMailListener` — consumer group `mail` on `incidents:events`
  (a *different* group registration than `RealtimeStreamsConsumer`'s
  `realtime` group on the same stream — Streams consumer groups are
  independent per-group cursors, so both see every event exactly once,
  fully split from each other). Translates events into
  `MailService.enqueue(...)` calls.

Each has its **own dedicated blocking Redis connection**
(`MAIL_BLOCKING_CLIENT`, `MAIL_EVENTS_BLOCKING_CLIENT` — D13) so a slow
SMTP send never stalls event ingestion, and vice versa.

### D9 — MailService, the only writer
```ts
enqueue(msg: OutboundMail): Promise<string>                          // XADD mail:outbox -> entry id
renderTemplate(name: TemplateName, data): string                     // escaped HTML body
deliver(to, subject, template, data): Promise<void>                  // render + send, called by the consumer
private deliverViaSmtp(to, subject, html): Promise<void>
type OutboundMail = { to: string; subject: string; template: TemplateName; data: Record<string, unknown> };
```
`enqueue` uses `REDIS_CLIENT` (non-blocking). Templates
(`mail-templates.ts`) are typed inline TS functions — no template engine —
and every `{{variable}}` is HTML-escaped (`mail-escape.util.ts`) before it
reaches an email body (R13, XSS-safe). `deliver` is what
`MailOutboxConsumer` calls after claiming an entry; `enqueue` never sends
synchronously.

### D10 — event → recipient routing
| Event | Recipients |
|---|---|
| `incident.created` | reporter + active admins (`users` joined to `roles` where `name='admin'`) |
| `incident.assigned` | assignee |
| `incident.status_changed` | reporter + assignee |
| `comment.created` | incident reporter + prior commenters |

Admin resolution is memoised in-process for 60s — deliberately **not**
the `perm:` cache (that one is keyed per-user and owned by Auth's own
invalidation contract). A recipient with `email IS NULL` is skipped with
a debug log and never retried.

> **Known gap (not part of T3.5's scope):** `comments.service.ts` today
> only emits `comment.added` on the local `EventEmitter2` — it does not
> yet `XADD` a `comment.created` entry onto `incidents:events`. The
> `comment.created` routing above is implemented and unit-tested against
> a synthetic stream entry, but nothing in the current codebase actually
> produces that event yet. Wiring `CommentsService` to publish it is a
> follow-up, tracked in `apply-progress`.

### D11 — `users.email`
Migration `0010_user_email.sql`: nullable `varchar(320)` + a unique
partial index (`WHERE email IS NOT NULL`, so the many `NULL` rows never
collide). Every anonymous identity and every pre-existing user starts
with `email IS NULL`.

### D12 — retry, DLQ, failure classes
Sweep every `MAIL_SWEEP_INTERVAL_MS` (default 10s): `XPENDING` (extended
form) → entries idle longer than `claimIdleMs` (30s, not env-configurable
in production; only overridable via `MAIL_CLAIM_IDLE_MS` for the e2e
harness) → below `maxAttempts` (3, Redis's own native per-entry delivery
counter) get `XCLAIM`ed and retried; at or above `maxAttempts` they move
straight to `mail:dead` (`XADD` + `XACK` origin) without another claim.

| Failure | Handling |
|---|---|
| SMTP connect/send | left pending, claimed by the sweep (transport, retryable) |
| Template render / bad payload (unparsable JSON, unknown template name) | straight to `mail:dead` + error log (data defect, never retryable) |
| `SMTP_HOST` unset | log-only transport, entry XACKed immediately (dev/test fallback) |
| Loop crash | `running=false`, `quit()`, container restart recreates the group (BUSYGROUP-tolerant) |

### D13 — connections
`MAIL_BLOCKING_CLIENT` and `MAIL_EVENTS_BLOCKING_CLIENT`, registered in
`CoreModule` alongside `REDIS_BLOCKING_CLIENT`, same factory
(`cache.streamsUrl`, `lazyConnect`, `maxRetriesPerRequest: null`). No new
Redis DB — Streams/tag-sets/socket.io continue to share DB 0 by design;
each blocking consumer simply gets its own TCP connection.

## Environment variables

```
SMTP_HOST=                # unset -> log-only fallback, no real send attempted
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=             # never logged, anywhere (R13)
SMTP_FROM=no-reply@transito-alerta.example
MAIL_SWEEP_INTERVAL_MS=10000   # XPENDING/XCLAIM sweep interval
```

## Testing
- Unit: `mail-escape.util.spec.ts`, `mail.service.spec.ts`,
  `mail-outbox.consumer.spec.ts`, `incident-mail.listener.spec.ts` — all
  Redis/nodemailer calls mocked, same seam convention as
  `streams.consumer.spec.ts`.
- E2E: `backend/test/e2e/mail.e2e-spec.ts` — Testcontainers
  `redis:7-alpine`, the real running app, `MailService.deliver` spied
  per-test to make transient-failure/dead-letter timing deterministic
  without a real SMTP server. Four scenarios: enqueue→deliver→ack,
  stalled entry claimed by the sweep→retry succeeds, a real
  `incident.created` HTTP flow→listener→consumer delivery, 3 failed
  attempts→`mail:dead`.

## Rollback
Drop `backend/src/modules/mail/`, revert the two `CoreModule` tokens
(D13), revert `app.module.ts`'s `MailModule` import, run
`database/rollback/0010_user_email.DOWN.sql`, `pnpm remove nodemailer
@types/nodemailer`, `DEL mail:outbox mail:dead` on the streams DB.
