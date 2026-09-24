import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { UpdateLocationDto } from './dto/update-location.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { OperatorLocationService } from './operator-location.service';
import { OperatorDashboardService } from './operator-dashboard.service';
export declare class OperatorsController {
    private readonly locationService;
    private readonly dashboardService;
    constructor(locationService: OperatorLocationService, dashboardService: OperatorDashboardService);
    recordLocation(dto: UpdateLocationDto, req: AuthenticatedRequest): Promise<{
        status: string;
    }>;
    getLocations(req: AuthenticatedRequest): Promise<{
        operators: import("./dto/operator-location.dto").OperatorLocationDto[];
    }>;
    getDashboard(query: DashboardQueryDto, req: AuthenticatedRequest): Promise<import("./dto/operator-dashboard-response.dto").OperatorDashboardResponseDto>;
}
