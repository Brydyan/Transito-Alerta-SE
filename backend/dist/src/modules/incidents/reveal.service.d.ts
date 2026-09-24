import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { IncidentsRepository } from './incidents.repository';
export declare class RevealService {
    private readonly incidentsRepository;
    private readonly auditService;
    private readonly dataSource;
    private readonly logger;
    constructor(incidentsRepository: IncidentsRepository, auditService: AuditService, dataSource: DataSource);
    reveal(incidentId: string, masterId: string, input: {
        justification: string;
        caseRef?: string | null;
    }): Promise<{
        incident_id: string;
        reporter: {
            id: string;
            email: string | null;
            first_name: string | null;
        };
    }>;
    listReveals(incidentId: string): Promise<Array<{
        revealed_by: string;
        revealed_at: Date;
        justification: string;
        case_ref: string | null;
    }>>;
}
