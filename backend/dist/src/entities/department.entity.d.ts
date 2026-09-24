import { OrganizationEntity } from './organization.entity';
export declare class DepartmentEntity {
    id: string;
    name: string;
    description: string | null;
    organizationId: string;
    organization?: OrganizationEntity;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
