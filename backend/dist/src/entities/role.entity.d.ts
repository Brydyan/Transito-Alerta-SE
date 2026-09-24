export declare class RoleEntity {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    scope: string;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
