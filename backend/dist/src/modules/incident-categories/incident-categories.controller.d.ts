import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CreateIncidentCategoryDto } from './dto/create-incident-category.dto';
import { UpdateIncidentCategoryDto } from './dto/update-incident-category.dto';
import { ListResult } from './incident-categories.service';
import { CategoryNode } from './incident-categories.repository';
import { IncidentCategoriesService } from './incident-categories.service';
export declare class IncidentCategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: IncidentCategoriesService);
    getTree(): Promise<CategoryNode[]>;
    list(search?: string, parentId?: string, page?: string, perPage?: string): Promise<ListResult>;
    findOne(id: string): Promise<IncidentCategoryEntity>;
    create(dto: CreateIncidentCategoryDto): Promise<IncidentCategoryEntity>;
    update(id: string, dto: UpdateIncidentCategoryDto): Promise<IncidentCategoryEntity>;
    remove(id: string): Promise<void>;
}
