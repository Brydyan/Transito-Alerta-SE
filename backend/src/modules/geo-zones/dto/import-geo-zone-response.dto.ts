/**
 * Response envelope for POST /geo-zones/import (design D8).
 * Returned as HTTP 200 — even partial imports are "successful" at the
 * transport level; per-feature failures go into `errors`.
 */
export interface ImportGeoZoneResponse {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; reason: string }>;
  warnings: string[];
}
