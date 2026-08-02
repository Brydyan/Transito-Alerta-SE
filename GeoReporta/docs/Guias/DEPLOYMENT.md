# Deployment Guide

## Redis Feed v2 (H4)

The feed cache was migrated to a v2 Redis key structure for performance.

### Key layout

| Key | Type | Purpose |
|---|---|---|
| `feed:v2:items` | Hash | `{incident_id → JSON payload}` — all incident data |
| `feed:v2:index` | Sorted Set | `{incident_id → created_at epoch}` — ordering and pagination |
| `feed:incidents` | Sorted Set (legacy) | Old key, auto-expires 7 days after last rebuild |

### TTL

Both `feed:v2:items` and `feed:v2:index` have a **7-day TTL** (604 800 seconds), refreshed on each `feed:rebuild`.

### Post-deploy steps

1. Run the rebuild command to populate the v2 keys:

   ```bash
   php artisan feed:rebuild
   ```

2. Verify the feed endpoint returns data:

   ```bash
   curl http://localhost/api/incidents/feed
   ```

The old `feed:incidents` key is automatically TTL'd for 7 days after each rebuild and can be ignored. Individual `incident:{id}` keys from the previous format are not actively cleaned — they will expire naturally if unused or can be manually purged with `redis-cli --scan --pattern 'incident:*' | xargs redis-cli del`.

### Op count

A `getFeed()` call with v2 keys present performs exactly **2 Redis round-trips**:

1. `ZREVRANGE feed:v2:index 0 499` — get candidate IDs
2. `HGETALL feed:v2:items` — get all item payloads

Filtering and pagination happen in PHP.
