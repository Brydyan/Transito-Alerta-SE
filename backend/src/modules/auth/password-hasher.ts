import * as bcrypt from 'bcrypt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthConfig } from '../../config/auth.config';

/**
 * A real bcrypt hash of a fixed constant string, computed once per process
 * at import time (D9 timing equalization) — `AuthService.loginWithPassword`
 * compares against this when the looked-up user is missing or has no
 * `password_hash`, so an unknown-email 401 costs the same wall-clock as a
 * wrong-password 401 (no user enumeration via timing).
 *
 * Deliberately hashed at the DEFAULT bcrypt cost (10), not the
 * config-driven `bcryptCost` — this constant is computed once at module
 * load, before any `ConfigService` is available, and its own cost only
 * needs to be "expensive enough to look like a real compare", not to match
 * production's per-request cost exactly.
 */
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalization', 10);

/**
 * PasswordHasher (T3.6 design "Component Design") — injectable so the
 * bcrypt cost is read from `AuthConfig.bcryptCost` (config-driven, NEVER a
 * hardcoded literal): production defaults to 12, unit tests override to 4
 * via `ConfigService` so ~40 hash calls don't cost seconds of pure CPU.
 */
@Injectable()
export class PasswordHasher {
  constructor(private readonly configService: ConfigService) {}

  private get cost(): number {
    return this.configService.get<AuthConfig>('auth')!.bcryptCost;
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
