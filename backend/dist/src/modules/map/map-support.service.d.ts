import { Repository } from 'typeorm';
import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { MapFiltersResponseDto } from './dto/map-filters-response.dto';
export declare class MapSupportService {
    private readonly categoryRepo;
    constructor(categoryRepo: Repository<IncidentCategoryEntity>);
    getMapFilters(): Promise<MapFiltersResponseDto>;
}
