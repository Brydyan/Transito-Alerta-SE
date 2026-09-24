import type { Response } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { IncidentStatus } from '../../entities/incident.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { WeeklyStatsQueryDto } from './dto/weekly-stats-query.dto';
import { RevealIncidentDto } from './dto/reveal-incident.dto';
import { RevealService } from './reveal.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { ExportFormat } from './incident-export.service';
import { IncidentRow } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { IncidentAnalyticsService } from './incident-analytics.service';
import { IncidentFeedService } from './incident-feed.service';
import { IncidentExportService } from './incident-export.service';
import { FeedRecoveryService } from './feed-recovery.service';
import { IncidentWorkflowService } from './incident-workflow.service';
export declare class IncidentsController {
    private readonly incidentsService;
    private readonly analyticsService;
    private readonly feedService;
    private readonly exportService;
    private readonly feedRecoveryService;
    private readonly workflow;
    private readonly revealService;
    constructor(incidentsService: IncidentsService, analyticsService: IncidentAnalyticsService, feedService: IncidentFeedService, exportService: IncidentExportService, feedRecoveryService: FeedRecoveryService, workflow: IncidentWorkflowService, revealService: RevealService);
    create(dto: CreateIncidentDto, req: AuthenticatedRequest): Promise<IncidentRow>;
    findAll(req: AuthenticatedRequest, zoneId?: string, status?: IncidentStatus): Promise<IncidentRow[]>;
    getStats(query: StatsQueryDto, req: AuthenticatedRequest): Promise<import("./dto/stats-response.dto").IncidentStatsResponseDto>;
    getWeeklyStats(query: WeeklyStatsQueryDto, req: AuthenticatedRequest): Promise<import("./dto/stats-response.dto").WeeklyStatsResponseDto>;
    getFeed(query: FeedQueryDto, req: AuthenticatedRequest): Promise<import("./dto/stats-response.dto").FeedResponseDto>;
    exportCsv(query: ExportQueryDto, format: ExportFormat | undefined, req: AuthenticatedRequest, res: Response): Promise<void>;
    getStatuses(): {
        id: IncidentStatus;
        label: string;
    }[];
    rebuildFeed(req: AuthenticatedRequest): Promise<{
        rebuilt: number;
    }>;
    findOne(id: string, req: AuthenticatedRequest): Promise<IncidentRow>;
    updateStatus(id: string, dto: UpdateIncidentStatusDto, req: AuthenticatedRequest): Promise<IncidentRow>;
    update(id: string, dto: UpdateIncidentDto): Promise<IncidentRow>;
    delete(id: string): Promise<void>;
    revealReporter(id: string, dto: RevealIncidentDto, req: AuthenticatedRequest): Promise<{
        incident_id: string;
        reporter: {
            id: string;
            email: string | null;
            first_name: string | null;
        };
    }>;
    listReveals(id: string): Promise<Array<{
        revealed_by: string;
        revealed_at: Date;
        justification: string;
        case_ref: string | null;
    }>>;
}
