import { DataSource, Repository } from 'typeorm';
import { StatusHistoryEntity } from '../../entities/status-history.entity';
export interface InsertStatusHistoryData {
    incidentId: string;
    changedByUserId: string | null;
    previousStatus: string;
    newStatus: string;
    eventId: string;
}
export declare class StatusHistoryRepository {
    private readonly dataSource;
    private readonly ormRepo;
    constructor(dataSource: DataSource, ormRepo: Repository<StatusHistoryEntity>);
    insert(data: InsertStatusHistoryData): Promise<Array<{
        id: string;
    }>>;
    findByIncident(incidentId: string): Promise<StatusHistoryEntity[]>;
}
