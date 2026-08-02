# k6 — Load Configuration

Current defaults for each script in `perf/scripts/`, and how to change VUs
(virtual users) / duration for a run.

## Current defaults

| Script | Mode | Default load | Thresholds |
|--------|------|---------------|------------|
| `smoke.js` | fixed | `vus: 1`, `iterations: 5` | none |
| `incidents-read.js` | ramping stages | ramp to **10 VUs** over 30s → hold 10 VUs for 1m → ramp down 10s | `p(95)<300ms`, error rate `<1%` |
| `incidents-write.js` | ramping stages | ramp to **5 VUs** over 20s → hold 5 VUs for 40s → ramp down 10s | `p(95)<500ms`, error rate `<1%` |

`smoke.js` is a fixed-load sanity check (1 VU, 5 iterations, no ramping,
no thresholds) — just confirms the API responds before running a real load
test. `incidents-read.js` and `incidents-write.js` use `stages`, k6's ramp
pattern: each `{ duration, target }` entry ramps VUs linearly from the
previous stage's target to this stage's target over `duration`.

These are intentionally modest — local dev machine, not a prod-scale rig
(see comment in `incidents-read.js`).

## How to change VUs / duration

### Option A — edit the script directly

Open the script under `perf/scripts/` and change `options`:

```js
// Fixed load (smoke.js style)
export const options = {
  vus: 20,          // concurrent virtual users
  iterations: 100,   // total iterations across all VUs, then stop
};

// Ramping load (incidents-read.js / incidents-write.js style)
export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp 0 -> 50 VUs over 30s
    { duration: '2m', target: 50 },   // hold 50 VUs for 2m
    { duration: '10s', target: 0 },   // ramp down to 0
  ],
};
```

### Option B — override from the CLI, without editing the script

k6 flags override `options` in the script at runtime:

```bash
# Fixed VUs + duration (ignores `stages`/`iterations` in the script)
docker compose -f docker-compose.yml -f docker-compose.perf.yml run --rm k6 \
  run --vus 20 --duration 1m /scripts/incidents-read.js

# Fixed VUs + fixed iteration count
docker compose -f docker-compose.yml -f docker-compose.perf.yml run --rm k6 \
  run --vus 10 --iterations 50 /scripts/smoke.js
```

`--vus`/`--duration` fully replace `stages` for that run (k6 does not merge
them). Use Option A instead if you want to change the ramp shape itself
(number of stages, ramp speed) rather than just the peak concurrency.

## Where results show up

Metrics push to InfluxDB (`perf` overlay) and render in the same Grafana
instance as the main stack (`http://localhost:3001`), under the **k6**
dashboard folder — see `perf/README.md`.
