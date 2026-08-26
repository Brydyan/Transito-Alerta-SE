# Apply Progress: T5.2 Incident Analytics

**Status**: COMPLETE  
**Date**: 2026-08-23  
**Mode**: Strict TDD  

## Summary

All 9 phases complete. 760 unit tests + 188 e2e tests passing.

## Files Created

- `backend/src/modules/incidents/dto/stats-query.dto.ts`
- `backend/src/modules/incidents/dto/weekly-stats-query.dto.ts`
- `backend/src/modules/incidents/dto/export-query.dto.ts`
- `backend/src/modules/incidents/dto/feed-query.dto.ts`
- `backend/src/modules/incidents/dto/stats-response.dto.ts`
- `backend/src/modules/incidents/incident-analytics.service.ts`
- `backend/src/modules/incidents/incident-analytics.service.spec.ts` (8 unit tests)
- `backend/src/modules/incidents/incident-feed.service.ts`
- `backend/src/modules/incidents/incident-feed.service.spec.ts` (4 unit tests)
- `backend/src/modules/incidents/incident-export.service.ts`
- `backend/src/modules/incidents/incident-export.service.spec.ts` (3 unit tests)
- `backend/test/e2e/incident-analytics.e2e-spec.ts` (14 e2e tests)

## Files Modified

- `backend/src/modules/incidents/incidents.controller.ts` — added 4 routes (stats, weekly-stats, feed, export) + 3 new service injections
- `backend/src/modules/incidents/incidents.controller.spec.ts` — updated constructor to pass 4 args
- `backend/src/modules/incidents/incidents.module.ts` — registered 3 new services

## Key Decisions / Gotchas

- `date-fns` not in package.json — used native Date methods
- `resolution_date` column absent — proxy: `DATE(updated_at) = CURRENT_DATE` when status = 'resolved'
- `location_id` filter maps to `zone_id` DB column
- CSV export uses Node.js `Readable` stream + batches of 500
- `ST_AsGeoJSON(i.location)::json` returns as `object` from pg driver — typed as `object | null` not `string | null`
- CACHE_MANAGER TTL in milliseconds (3600 * 1000)
- Cache key format: `stats:{orgScope}:{filterHash}` where filterHash = sha256 (16-char hex)
- Route order: literal routes (stats/weekly-stats/feed/export) BEFORE `:id` wildcard
- Unit tests use plain objects (`{} as TypeName`) to avoid reflect-metadata error with @Type() decorators
- Citizen feed Redis test uses Postgres fallback path (env.reset() flushes cache DB)

## Test Results

- Unit: 760/760 pass (85 suites)
- E2E: 188/188 pass (20 suites)
