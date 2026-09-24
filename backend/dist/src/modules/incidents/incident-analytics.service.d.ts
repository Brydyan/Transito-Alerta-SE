import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { AuthContext } from '../../common/authz/subject-scope';
import { StatsQueryDto } from './dto/stats-query.dto';
import { WeeklyStatsQueryDto } from './dto/weekly-stats-query.dto';
import { IncidentStatsResponseDto, WeeklyStatsResponseDto } from './dto/stats-response.dto';
export declare class IncidentAnalyticsService {
    private readonly dataSource;
    private readonly cache;
    constructor(dataSource: DataSource, cache: Cache);
    private buildOrgScope;
    private buildOrgClause;
    private filterHash;
    private buildDateClause;
    private formatResolutionTime;
    getStats(query: StatsQueryDto, user: AuthContext): Promise<IncidentStatsResponseDto>;
    private computeTrends;
    getWeeklyStats(query: WeeklyStatsQueryDto, user: AuthContext): Promise<WeeklyStatsResponseDto>;
}
