import type { Request } from 'express';

import { AuthContext } from '../authz/subject-scope';

/**
 * Single shared `AuthenticatedRequest` (T3.2 design) replacing the three
 * duplicated interfaces previously in `incidents.controller.ts`,
 * `comments.controller.ts`, and `users.controller.ts` — three copies would
 * drift the instant `scope` was added to only two of them.
 *
 * `req.user` is the full `AuthContext` set by `JwtStrategy.validate`
 * (design "Sequence Flows" — Login + context resolution).
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthContext;
}
