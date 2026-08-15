import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JwtAuthGuard — thin wrapper over passport's 'jwt' strategy (401 on failure). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
