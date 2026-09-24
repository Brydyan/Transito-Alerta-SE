import { PermissionAction } from '../common/decorators/require-permission.decorator';
export declare class PermissionEntity {
    id: string;
    resource: string;
    action: PermissionAction;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
