import type { Request } from 'express';
import { MenuEntry } from './menu-map';
import { MenusService } from './menus.service';
export interface AuthenticatedRequest extends Request {
    user: {
        userId: string;
        roleName: string | null;
        permissions: string[];
    };
}
export declare class MenusController {
    private readonly menusService;
    constructor(menusService: MenusService);
    getMenu(request: AuthenticatedRequest): Promise<MenuEntry[]>;
}
