import { IncidentsService } from './modules/incidents/incidents.service';
export declare class AppController {
    private readonly incidentsService;
    constructor(incidentsService: IncidentsService);
    getHealth(): {
        status: string;
        timestamp: string;
    };
    getEstados(): {
        id: import("./entities/incident.entity").IncidentStatus;
        label: string;
    }[];
}
