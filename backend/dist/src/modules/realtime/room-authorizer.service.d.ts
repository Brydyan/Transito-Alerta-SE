import { DataSource } from 'typeorm';
import { AuthContext } from '../../common/authz/subject-scope';
export declare class RoomAuthorizer {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    authorize(ctx: AuthContext, room: string): Promise<boolean>;
    private findOrgIdForZone;
    private findOrgIdForIncident;
}
