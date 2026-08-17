import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuthContext } from '../../common/authz/subject-scope';
import { canJoinRoom } from './room.util';

/**
 * RoomAuthorizer (T3.2 design D11) — the async half of room authorization.
 * `geo:`/`incident:` rooms need an owning-`organization_id` lookup before
 * the pure `canJoinRoom` can decide; `user:`/`org:` rooms need none.
 *
 * Injects `DataSource` directly (raw SQL), matching the existing
 * repository convention — deliberately NOT importing IncidentsModule or
 * OrganizationsModule (design "Module Boundary": RealtimeModule -> AuthModule
 * only, zero domain-module edge, zero cycle risk).
 */
@Injectable()
export class RoomAuthorizer {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async authorize(ctx: AuthContext, room: string): Promise<boolean> {
    if (room.startsWith('geo:')) {
      const zoneId = room.slice('geo:'.length);
      const ownerOrgId = await this.findOrgIdForZone(zoneId);
      return canJoinRoom(ctx, room, ownerOrgId);
    }

    if (room.startsWith('incident:')) {
      const incidentId = room.slice('incident:'.length);
      const ownerOrgId = await this.findOrgIdForIncident(incidentId);
      return canJoinRoom(ctx, room, ownerOrgId);
    }

    // user:/org:/unknown — no DB lookup needed.
    return canJoinRoom(ctx, room);
  }

  private async findOrgIdForZone(zoneId: string): Promise<string | null> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM organizations WHERE zone_id = $1`,
      [zoneId],
    );
    return rows[0]?.id ?? null;
  }

  private async findOrgIdForIncident(incidentId: string): Promise<string | null> {
    const rows: { organization_id: string | null }[] = await this.dataSource.query(
      `SELECT organization_id FROM incidents WHERE id = $1`,
      [incidentId],
    );
    return rows[0]?.organization_id ?? null;
  }
}
