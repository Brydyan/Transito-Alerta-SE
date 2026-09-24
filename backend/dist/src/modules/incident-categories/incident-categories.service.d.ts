import { Repository } from 'typeorm';
import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CreateIncidentCategoryDto } from './dto/create-incident-category.dto';
import { UpdateIncidentCategoryDto } from './dto/update-incident-category.dto';
import { CategoryNode, IncidentCategoriesRepository } from './incident-categories.repository';
export declare const DEFAULT_PAGE_SIZE = 15;
export declare const MAX_PAGE_SIZE = 100;
export interface ListFilters {
    search?: string;
    parentId?: string | null;
    page?: number;
    perPage?: number;
}
export interface ListResult {
    items: IncidentCategoryEntity[];
    total: number;
}
export declare class IncidentCategoriesService {
    private readonly categoryRepo;
    private readonly categoriesRepository;
    constructor(categoryRepo: Repository<IncidentCategoryEntity>, categoriesRepository: IncidentCategoriesRepository);
    create(dto: CreateIncidentCategoryDto): Promise<IncidentCategoryEntity>;
    update(id: string, dto: UpdateIncidentCategoryDto): Promise<IncidentCategoryEntity>;
    delete(id: string): Promise<void>;
    findById(id: string): Promise<IncidentCategoryEntity>;
    list(filters?: ListFilters): Promise<ListResult>;
    getTree(): Promise<CategoryNode[]>;
    private assertValidParent;
}
