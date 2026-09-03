/**
 * Wire-format models for Geo Zones (F2.3 — Ubicaciones).
 *
 * Field names are snake_case because the backend sends them that way through
 * the SnakeCaseResponseInterceptor, matching the `GeoZoneEntity` / repository
 * row surface. Do NOT rename to camelCase.
 *
 * Level keys follow the REAL backend wire
 * (`GEO_ZONE_LEVELS` in `backend/src/entities/geo-zone.entity.ts`):
 *   'provincia' | 'canton' | 'parroquia' | 'zona'
 * There is NO 'pais' level in the backend.
 */

export type GeoZoneLevel = 'provincia' | 'canton' | 'parroquia' | 'zona';

/** The wire field surface for a geo zone. `polygon` is optional on the
 *  frontend (the list/tree never sends or reads it). */
export interface IGeoZone {
  id: string;
  name: string;
  code: string | null;
  level: GeoZoneLevel;
  parent_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** PostGIS geometry, not needed by the frontend tree. Optional. */
  polygon?: unknown;
}

/** Client-derived tree node. `children` and `depth` are NOT part of the wire. */
export interface IGeoZoneNode extends IGeoZone {
  children: IGeoZoneNode[];
  depth: number;
}

/**
 * Display labels keyed by level value. Keys stay lowercase (the backend wire);
 * values are Spanish domain terms matching the F2.3 mock (Provincia, Cantón,
 * Parroquia, Zona). Accents are used for display only.
 */
export const GEO_ZONE_LEVELS: readonly GeoZoneLevel[] = [
  'provincia',
  'canton',
  'parroquia',
  'zona',
];

export const GEO_ZONE_LEVEL_LABELS: Record<GeoZoneLevel, string> = {
  provincia: 'Provincia',
  canton: 'Cantón',
  parroquia: 'Parroquia',
  zona: 'Zona',
};

export interface ICreateGeoZoneDto {
  name: string;
  /**
   * REQUIRED by the backend `CreateGeoZoneDto` (`@IsGeoJsonPolygon()` — not
   * optional). The F2.3 form has no map/drawing tool, so a minimal valid
   * GeoJSON polygon is sent as a placeholder.
   */
  polygon: IGeoJsonPolygon;
  level?: GeoZoneLevel;
  parent_id?: string | null;
  active?: boolean;
  code?: string | null;
}

export interface IUpdateGeoZoneDto {
  name?: string;
  level?: GeoZoneLevel;
  parent_id?: string | null;
  active?: boolean;
  code?: string | null;
  /** Optional on update — omitted when the form does not touch geometry. */
  polygon?: IGeoJsonPolygon;
}

/** Minimal GeoJSON Polygon shape accepted by the backend validator. */
export interface IGeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface IGeoZoneListParams {
  search?: string;
  parent_id?: string;
  level?: GeoZoneLevel;
  include_inactive?: boolean;
  code?: string;
  page?: number;
  per_page?: number;
}

export interface IGeoZoneListResult {
  items: IGeoZone[];
  total: number;
}
