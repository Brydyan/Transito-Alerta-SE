import type { Request } from 'express';
import { AuthContext } from '../authz/subject-scope';
export interface AuthenticatedRequest extends Request {
    user?: AuthContext;
}
