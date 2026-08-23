export interface StatsByKey {
  [key: string]: number;
}

export interface ResolutionTime {
  formatted: string;
  days: number;
  hours: number;
  seconds: number;
}

export interface Trends {
  total_pct: number | null;
  pendientes_pct: number | null;
  resolution_rate_pct: number | null;
}

export interface TopCategory {
  name: string;
  total: number;
  resolved: number;
  pending: number;
}

export interface IncidentStatsResponseDto {
  total: number;
  by_status: StatsByKey;
  by_priority: StatsByKey;
  recent_count: number;
  locations_count: number;
  average_resolution_time: ResolutionTime | null;
  trends: Trends;
  top_categories: TopCategory[];
}

export interface DayDataPoint {
  date: string;
  label: string;
  recibidas: number;
  resueltas: number;
}

export interface WeeklyStatsResponseDto {
  days: DayDataPoint[];
}

export interface FeedItemDto {
  id: string;
  incident_category_id: string | null;
  organization_id: string | null;
  user_id: string;
  location_id: string | null;
  title: string;
  status: string;
  priority: string;
  resolution_date: Date | null;
  created_at: Date;
  updated_at: Date;
  geom: object | null;
  category: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  user: { id: string; name?: string } | null;
  location: { id: string; name: string } | null;
}

export interface FeedResponseDto {
  data: FeedItemDto[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}
