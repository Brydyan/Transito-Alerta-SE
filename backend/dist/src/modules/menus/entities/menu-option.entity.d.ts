export declare class MenuOptionEntity {
    id: string;
    name: string;
    route: string;
    icon: string | null;
    parentId: string | null;
    displayOrder: number;
    isActive: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
