import { randomUUID } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export const PERMISSION_CACHE_PREFIX = 'perm:';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  permissions: string[];
}

/**
 * AuthService — device-UUID identity + dual JWT + Redis-cached permissions.
 * Implements D1 (identity spectrum), D2 (permissions in Redis, not JWT
 * claims), and CC2 (dual anonymous/authenticated identity).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  private get authConfig(): AuthConfig {
    return this.configService.get<AuthConfig>('auth')!;
  }

  async login(deviceUuid: string): Promise<AuthTokens> {
    if (!deviceUuid || !deviceUuid.trim()) {
      throw new UnauthorizedException('device_uuid is required');
    }

    let user = await this.userRepo.findOne({ where: { deviceUuid } });
    if (!user) {
      user = this.userRepo.create({ deviceUuid, permissions: [], isActive: true });
      user = await this.userRepo.save(user);
    }

    const permissions = await this.getPermissions(deviceUuid);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = this.signRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      permissions,
    };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.authConfig.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found for refresh token');
    }

    return { access_token: this.signAccessToken(user.id) };
  }

  validateToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.authConfig.jwtAccessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** GET /api/auth/me support — resolves device_uuid + permissions for a user id. */
  async getMe(userId: string): Promise<{ deviceUuid: string; permissions: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const permissions = await this.getPermissions(user.deviceUuid);
    return { deviceUuid: user.deviceUuid, permissions };
  }

  async getPermissions(deviceUuid: string): Promise<string[]> {
    const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } =
      this.authConfig;

    if (deviceUuid === anonymousDeviceUuid) {
      return anonymousPermissions;
    }

    const key = `${PERMISSION_CACHE_PREFIX}${deviceUuid}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({ where: { deviceUuid } });
    const permissions = user?.permissions ?? [];
    await this.cache.set(key, permissions, permissionCacheTtlSeconds * 1000);
    return permissions;
  }

  private signAccessToken(userId: string): string {
    const payload: JwtPayload = { sub: userId, typ: 'access', jti: randomUUID(), pv: 1 };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtAccessSecret,
      expiresIn: this.authConfig.jwtAccessExpiresIn,
    });
  }

  private signRefreshToken(userId: string): string {
    const payload: JwtPayload = { sub: userId, typ: 'refresh', jti: randomUUID(), pv: 1 };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtRefreshSecret,
      expiresIn: this.authConfig.jwtRefreshExpiresIn,
    });
  }
}
