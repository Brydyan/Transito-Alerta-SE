import type Redis from 'ioredis';
import { OperatorLocationDto } from './dto/operator-location.dto';
export declare class OperatorLocationService {
    private readonly redis;
    constructor(redis: Redis);
    record(userId: string, orgId: string, lat: number, lng: number): Promise<void>;
    activeFor(orgId: string | null, isSystemAdmin: boolean): Promise<OperatorLocationDto[]>;
}
