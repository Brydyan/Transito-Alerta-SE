import { DataSource } from 'typeorm';
export interface CategoryRow {
    id: string;
    name: string;
    parent_id: string | null;
    created_at: Date;
    depth: number;
}
export interface CategoryNode {
    id: string;
    name: string;
    parent_id: string | null;
    created_at: Date;
    children: CategoryNode[];
}
export declare class IncidentCategoriesRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    listFlat(rootId: string | null): Promise<CategoryRow[]>;
    getSubtree(rootId: string | null): Promise<CategoryNode[]>;
    validateNoCycles(categoryId: string | null, proposedParentId: string | null): Promise<boolean>;
}
export declare function buildTree(rows: CategoryRow[]): CategoryNode[];
