import { DataSource } from 'typeorm';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { OperatorDashboardResponseDto } from './dto/operator-dashboard-response.dto';
export declare class OperatorDashboardService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    forOperator(userId: string, filters: DashboardQueryDto): Promise<OperatorDashboardResponseDto>;
}
