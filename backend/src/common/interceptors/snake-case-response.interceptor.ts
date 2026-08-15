import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { toSnakeCaseKeys } from '../utils/snake-case';

/**
 * Normalises every HTTP response body to snake_case keys.
 *
 * Without it the response shape is an accident of persistence: Incidents
 * reaches HTTP through raw PostGIS SQL and emits snake_case rows, while
 * Comments/Users/Assignments return TypeORM entities and leak camelCase.
 * Request DTOs are already snake_case throughout (`device_uuid`,
 * `incident_id`), so a client would otherwise send `incident_id` and receive
 * `incidentId` in the same round trip.
 *
 * Registered globally in main.ts rather than as per-module response DTOs:
 * Phase 3 adds nine more modules, and a global interceptor cannot be
 * forgotten in one of them. It is idempotent, so paths that already emit
 * snake_case pass through unchanged.
 *
 * This is the floor, not the ceiling — an endpoint whose response genuinely
 * differs from its entity (hiding fields, adding computed ones) still needs
 * its own response DTO.
 */
@Injectable()
export class SnakeCaseResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => toSnakeCaseKeys(body)));
  }
}
