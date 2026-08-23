export interface DashboardStatsDto {
  total_assigned: number;
  in_progress: number;
  resolved_today: number;
}

export interface DashboardIncidentDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimedBy: string | null;
  category: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface OperatorDashboardResponseDto {
  stats: DashboardStatsDto;
  incidents: DashboardIncidentDto[];
  pagination: PaginationMeta;
}
