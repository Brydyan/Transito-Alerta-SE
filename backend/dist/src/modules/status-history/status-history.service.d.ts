import { DataSource } from 'typeorm';
import { SubjectScope } from '../../common/authz/subject-scope';
import { StatusHistoryEntity } from '../../entities/status-history.entity';
import { StatusHistoryRepository } from './status-history.repository';
export interface StatusHistoryListResult {
    items: StatusHistoryEntity[];
    total: number;
}
export declare class StatusHistoryService {
    private readonly dataSource;
    private readonly statusHistoryRepository;
    constructor(dataSource: DataSource, statusHistoryRepository: StatusHistoryRepository);
    findByIncident(incidentId: string, scope: SubjectScope): Promise<StatusHistoryListResult>;
}
