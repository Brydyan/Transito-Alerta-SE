/**
 * Modelos del Dashboard — F6 redesign (`2026-09-08-f6-dashboard-redesign`).
 *
 * El backend (`/api/incidents/stats`, `/api/incidents/weekly-stats`,
 * `/api/incidents/feed`) ya expone todo lo necesario (ver
 * `backend/src/modules/incidents/dto/`). Estos tipos son la
 * proyección al frontend — SnakeCaseResponseInterceptor reescribe
 * la respuesta a snake_case, así que los nombres de campo siguen
 * lo que llega en el wire.
 *
 * NO usar `any`: el spec (D1 de F0) exige derivar los modelos
 * del wire real, no inventar campos.
 */

/** Bloque `by_status` / `by_priority` de la respuesta del backend. */
export type StatsByKey = Readonly<Record<string, number>>;

/** `average_resolution_time` — null cuando no hay resueltas. */
export interface ResolutionTime {
  readonly formatted: string;
  readonly days: number;
  readonly hours: number;
  readonly seconds: number;
}

/** `trends` — porcentajes de variación. Null cuando no hay histórico. */
export interface StatsTrends {
  readonly total_pct: number | null;
  readonly pendientes_pct: number | null;
  readonly resolution_rate_pct: number | null;
}

/** `top_categories[].name, .total, .resolved, .pending`. */
export interface TopCategory {
  readonly name: string;
  readonly total: number;
  readonly resolved: number;
  readonly pending: number;
}

/** Respuesta completa de `GET /api/incidents/stats`. */
export interface IncidentStats {
  readonly total: number;
  readonly by_status: StatsByKey;
  readonly by_priority: StatsByKey;
  readonly recent_count: number;
  readonly locations_count: number;
  readonly average_resolution_time: ResolutionTime | null;
  readonly trends: StatsTrends | null;
  readonly top_categories: ReadonlyArray<TopCategory>;
}

/** Punto diario de `GET /api/incidents/weekly-stats.days[]`. */
export interface WeeklyDayPoint {
  readonly date: string;
  readonly label: string;
  readonly recibidas: number;
  readonly resueltas: number;
}

/** Respuesta de `GET /api/incidents/weekly-stats`. */
export interface WeeklyStats {
  readonly days: ReadonlyArray<WeeklyDayPoint>;
}

/** Item de actividad — `GET /api/incidents/feed.data[]`. */
export interface ActivityItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly created_at: string;
  readonly category: { readonly name: string } | null;
}

/** Fila que el `RecentActivityComponent` muestra — proyección. */
export interface ActivityRow {
  readonly id: string;
  readonly category: string;
  readonly status: string;
  readonly priority: string;
  readonly createdAt: string;
}
