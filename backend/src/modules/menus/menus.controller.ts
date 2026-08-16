import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuEntry } from './menu-map';
import { MenusService } from './menus.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; permissions: string[] };
}

/**
 * MenusController (R16). Any authenticated caller may hit this endpoint —
 * PermissionGuard is intentionally NOT applied here (there is no single
 * fixed resource this route governs); the filtering happens per-entry in
 * MenusService instead, using the caller's own resolved permission set.
 */
@Controller('menus')
@UseGuards(JwtAuthGuard)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  getMenu(@Req() request: AuthenticatedRequest): Promise<MenuEntry[]> {
    return this.menusService.getMenuForUser(request.user.userId);
  }
}
