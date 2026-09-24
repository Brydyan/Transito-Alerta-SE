import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { AuthContext } from '../../common/authz/subject-scope';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedResponseDto } from './dto/stats-response.dto';
export declare class IncidentFeedService {
    private readonly dataSource;
    private readonly cache;
    constructor(dataSource: DataSource, cache: Cache);
    isStaffRole(user: AuthContext): boolean;
    private resolveZoneHierarchy;
    getStaffFeed(query: FeedQueryDto, user: AuthContext): Promise<FeedResponseDto>;
    getCitizenFeed(query: FeedQueryDto): Promise<FeedResponseDto>;
}
