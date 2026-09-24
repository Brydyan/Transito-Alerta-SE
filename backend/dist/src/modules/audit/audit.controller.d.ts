import type { Response } from 'express';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLogItemDto } from './dto/audit-log-item.dto';
import { AuditService } from './audit.service';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    list(filters: AuditLogFilterDto): Promise<{
        items: AuditLogItemDto[];
        total: number;
    }>;
    exportCsv(filters: AuditLogFilterDto, res: Response): Promise<void>;
}
