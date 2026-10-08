# Apply Progress — MinIO Object Storage Integration

**Change**: `infra/2026-10-07-minio-object-storage`
**Author**: minimax-builder
**Date**: 2026-10-07 (Round 1) / 2026-10-08 (Round 2 — compose.yaml fixes per `fixes-required.md`)
**Working dir**: `backend/` + repo root (compose.yaml) + `frontend/`

> **Round 2 note.** `sdd-verify` (claude-qa) returned AMARILLO on the compose
> config gate and ROJO on the runtime gate, then emitted `fixes-required.md`
> with two surgical findings, both in `compose.yaml`. The Round 1 backend
> code, nginx.conf, and test suite were left untouched (and remain green).
> This section is the only truth for the compose state. Sections below
> describe the original Round 1 work; the Round 2 changes are in §9.

---

## 1. Implementation summary (Round 1)

All 11 tasks (`tasks.md`) completed in a single pass; `verify-report.md` PASS.

| Phase | Tasks | Status |
|---|---|---|
| 1. Deps + config | T1.1 / T1.2 / T1.3 | ✓ |
| 2. Client + factory | T2.1 / T2.2 / T2.3 / T2.4 | ✓ |
| 3. Docker + nginx | T3.1 / T3.2 / T3.3 | ✓ (H1 + H2 deferred to Round 2) |
| 4. Verify | T4.1 / T4.2 / T4.3 / T4.4 | ✓ |

## 2. Deviations from `design.md` (Round 1)

- **`MinioStorageClient.delete()` logs a `warn` before swallowing** (vs. fully silent). Design D5 / R4 only requires "no propaga error si el objeto ya no existe"; a single log line per failure keeps ops visibility without breaking idempotency. See `verify-report.md` for the rationale.
- **Round 1 compose.yaml H1**: `entrypoint` had `mc alias set` split across two lines with the second line more-indented than the base. YAML 1.2 §8.1.3 says that under `>` (folded scalar) a more-indented continuation is preserved as a literal newline, not folded to space — so `/bin/sh -c` saw three separate commands and the `until` loop never exited. Fixed in Round 2 §9.
- **Round 1 compose.yaml H2**: healthcheck used `['CMD', 'mc', 'ready', 'local']` but the `minio/minio` server image does not include the `mc` client. Fixed in Round 2 §9 by switching to the HTTP-native health endpoint with `curl` (which IS in the server image).

## 3. CI gate results (Round 1)

| Gate | Command | Result |
|---|---|---|
| typecheck | `tsc --noEmit -p tsconfig.json` | 0 errors |
| full jest | `rtk jest` | 127 suites / 1336 tests / 0 failed / 11 skipped (pre-existing) |
| compose lint | `docker compose config --quiet` | clean (syntax OK; semantics broken — see H1/H2) |
| lint (F7 storage files + MinioStorageClient) | `eslint` | 0 errors, 0 warnings |

## 4. Contradictions found (Round 1)

None. `proposal.md`, `design.md`, `spec.md`, and the existing `IStorageClient` seam are internally consistent. The bugs in `compose.yaml` were purely in my implementation, not in the contract.

## 5. Skipped items (Round 1, reaffirmed in Round 2)

- **R5.1 runtime E2E** (`docker compose up` → curl served object) — dev sandbox has no Docker daemon. The Round 2 fixes (H1, H2) clear the documented compose-blocking issues; staging still owns the actual `docker compose up` + curl + `mc ls` smoke test.

## 6. Files touched (cumulative, Round 1 + Round 2)

See `verify-report.md` for the Round 1 list. Round 2 added/modified only:

- **`compose.yaml`** (H1 + H2):
  - `minio` healthcheck → `['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']`
  - `minio-init` entrypoint → `mc alias set` collapsed to one continuous line
- **`openspec/changes/infra/2026-10-07-minio-object-storage/apply-progress.md`** (this file) — added Round 2 banner + §9

Nothing else touched in Round 2 (per `fixes-required.md` "No Toques" — backend, nginx, and the rest of compose.yaml remain as they were).

## 7. Test counts (Round 1, unchanged in Round 2)

| Spec | Before | After | Δ |
|------|--------|-------|---|
| `minio-storage.client.spec.ts` | 0 | 12 | +12 |
| `storage-provider.factory.spec.ts` | 3 | 7 | +4 |
| `supabase-storage.client.spec.ts` | 7 | 7 | 0 (config object extended for type compat) |
| **Total new tests** | — | — | **+16** |

Full suite: 1320 → 1336 (+16). Failures: 0 (unchanged in Round 2 — no test code changed).

## 8. Re-verification request (Round 1)

Ready for `sdd-verify`. R1-R4 fully asserted in unit tests; R5.1 partially verified (compose config lint + script inspection) and partially deferred to staging.

---

## 9. Round 2 — compose.yaml fixes (2026-10-08)

`fixes-required.md` identified two surgical defects in `compose.yaml`. Both fixed; `docker compose config --quiet` exits 0 and the rendered manifest now shows the correct commands.

### H1 — `minio-init` entrypoint YAML fold

**Before** (Round 1):
```yaml
entrypoint: >
  /bin/sh -c "
  until /usr/bin/mc alias set local http://minio:9000
    ${MINIO_ROOT_USER:-minioadmin}            ← 8-space indent (MORE than 6 base)
    ${MINIO_ROOT_PASSWORD:-minioadmin123} > /dev/null 2>&1; do
```

YAML `>` rule: lines with indent **strictly greater** than the base are preserved as literal newlines, NOT folded to space. Result: `/bin/sh -c` ran three separate commands (`mc alias set ...`, then `minioadmin`, then `minioadmin123 > /dev/null 2>&1`). The `until` loop evaluated the last exit code, which was 127 (command not found) perpetually → infinite loop, bucket never created.

**After** (Round 2):
```yaml
entrypoint: >
  /bin/sh -c "
  until /usr/bin/mc alias set local http://minio:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin123} > /dev/null 2>&1; do
    echo 'Esperando a MinIO...';
    sleep 2;
  done;
  /usr/bin/mc mb --ignore-existing local/${STORAGE_MINIO_BUCKET:-uploads};
  /usr/bin/mc anonymous set download local/${STORAGE_MINIO_BUCKET:-uploads};
  echo 'Bucket de MinIO configurado con éxito.';
  exit 0;
  "
```

`mc alias set ...` is now on the same line as `until`; the `do/done` block body has indent 8 (preserved as newlines — correct shell syntax) and the next `mc mb` is back at 6 (folded to space). Net rendered command is a valid `until ... do ... done; mc ...; exit 0;` block.

### H2 — `minio` healthcheck

**Before** (Round 1): `['CMD', 'mc', 'ready', 'local']` — `mc` is not in the `minio/minio` server image, and there is no `local` alias. Fails always → `minio` always `unhealthy` → `minio-init` (with `condition: service_healthy`) never starts.

**After** (Round 2): `['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']` — uses the HTTP-native health endpoint exposed by MinIO, hit with `curl` (preinstalled in the server image exactly for this purpose). Standard idiom; matches the upstream MinIO docker-compose examples.

### Verification

`docker compose -f compose.yaml config --quiet` → exit 0.

`docker compose ... config` rendered output (truncated for brevity):
- `minio-init.entrypoint` = `/bin/sh -c " until /usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin123 > /dev/null 2>&1; do\n  echo 'Esperando a MinIO...';\n  sleep 2;\ndone; /usr/bin/mc mb --ignore-existing local/uploads; /usr/bin/mc anonymous set download local/uploads; echo 'Bucket de MinIO configurado con éxito.'; exit 0; "` — the `\n` in the JSON-style output is a real newline in the rendered shell string; the `mc alias set` is one logical command, the `do/done` body is multi-line shell — correct.
- `minio.healthcheck.test` = `curl -f http://localhost:9000/minio/health/live` — correct.

No backend code, no nginx.conf, no test code changed in Round 2. The TDD suite (1336 tests) and the unit-test claims in `verify-report.md` remain valid.

### Re-verification request

Ready for `sdd-verify`. The two compose.yaml defects from the audit are addressed; R5.1 runtime confirmation (actual `docker compose up` + `mc ls local/uploads` + curl a served object) still belongs to staging — the dev sandbox has no Docker daemon.
