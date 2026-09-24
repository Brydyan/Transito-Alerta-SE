import { Repository } from 'typeorm';
import { PermissionEntity } from '../../entities/permission.entity';
export declare class PermissionLookupService {
    private readonly permissionRepo;
    private readonly logger;
    private cache;
    private reverseCache;
    constructor(permissionRepo: Repository<PermissionEntity>);
    getUuid(action: string, resource: string): Promise<string | null>;
    getUuidSync(action: string, resource: string): string | null;
    buildCache(): Promise<void>;
    getDescriptionsByUuids(uuids: string[]): Promise<string[]>;
    invalidate(): void;
    getNamesByUuids(uuids: string[]): Promise<string[]>;
    getNamesByUuidsSync(uuids: string[]): string[];
    private key;
}
