import { DataSource, Repository } from 'typeorm';
import { Readable } from 'stream';
import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLogItemDto } from './dto/audit-log-item.dto';
export declare class AuditService {
    private readonly repo;
    private readonly dataSource;
    private readonly logger;
    private static readonly DEFAULT_PAGE;
    private static readonly DEFAULT_LIMIT;
    private static readonly EXPORT_CAP;
    private static readonly EXPORT_BATCH_SIZE;
    constructor(repo: Repository<AuditEventEntity>, dataSource: DataSource);
    record(input: {
        actorId: string;
        action: string;
        resourceType: string;
        resourceId?: string | null;
        justification?: string | null;
        metadata?: Record<string, unknown>;
    }, manager?: Repository<AuditEventEntity>['manager']): Promise<AuditEventEntity>;
    list(filters: AuditLogFilterDto): Promise<{
        items: AuditLogItemDto[];
        total: number;
    }>;
    exportCsv(filters: AuditLogFilterDto): Readable;
    private buildWhere;
}
