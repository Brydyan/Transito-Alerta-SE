import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../core/core.module';
import { OperatorLocationDto } from './dto/operator-location.dto';

@Injectable()
export class OperatorLocationService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async record(userId: string, orgId: string, lat: number, lng: number): Promise<void> {
    const value = JSON.stringify({
      userId,
      organizationId: orgId,
      lat,
      lng,
      updatedAt: new Date().toISOString(),
    });
    await this.redis.hset(`operators:loc:${orgId}`, userId, value);
    await this.redis.expire(`operators:loc:${orgId}`, 300);
  }

  async activeFor(orgId: string | null, isSystemAdmin: boolean): Promise<OperatorLocationDto[]> {
    if (isSystemAdmin) {
      const keys = await this.redis.keys('operators:loc:*');
      const all: OperatorLocationDto[] = [];
      for (const key of keys) {
        const raw = await this.redis.hgetall(key);
        all.push(...Object.values(raw ?? {}).map((v) => JSON.parse(v) as OperatorLocationDto));
      }
      return all;
    }
    if (!orgId) return [];
    const raw = await this.redis.hgetall(`operators:loc:${orgId}`);
    return Object.values(raw ?? {}).map((v) => JSON.parse(v) as OperatorLocationDto);
  }
}
