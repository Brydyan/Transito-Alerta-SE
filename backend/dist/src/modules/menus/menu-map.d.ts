export interface MenuEntry {
    label: string;
    route: string;
    icon?: string;
    group?: string;
    order: number;
    children: MenuEntry[];
}
interface MenuDefinition {
    route: string;
    requires: string;
    icon?: string;
    group?: string;
    order: number;
}
export declare const MENU_MAP: Record<string, MenuDefinition>;
export {};
