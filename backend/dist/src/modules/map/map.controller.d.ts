import { MapFiltersResponseDto } from './dto/map-filters-response.dto';
import { MapSupportService } from './map-support.service';
export declare class MapController {
    private readonly mapSupport;
    constructor(mapSupport: MapSupportService);
    getFilters(): Promise<MapFiltersResponseDto>;
}
