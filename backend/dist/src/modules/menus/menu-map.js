"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENU_MAP = void 0;
exports.MENU_MAP = {
    Dashboard: {
        route: '/dashboard',
        requires: 'READ dashboard',
        icon: 'layout-dashboard',
        order: 10,
    },
    Inicio: {
        route: '/inicio',
        requires: 'READ incidents',
        icon: 'home',
        group: 'INCIDENCIAS',
        order: 20,
    },
    'Lista de Incidencias': {
        route: '/incidencias',
        requires: 'READ incidents',
        icon: 'list',
        group: 'INCIDENCIAS',
        order: 30,
    },
    Mapa: {
        route: '/mapa',
        requires: 'READ incidents',
        icon: 'map',
        group: 'INCIDENCIAS',
        order: 40,
    },
    Reportar: {
        route: '/reportar',
        requires: 'CREATE incidents',
        icon: 'plus-circle',
        group: 'INCIDENCIAS',
        order: 50,
    },
    Usuarios: {
        route: '/admin/users',
        requires: 'READ users',
        icon: 'users',
        group: 'GESTIÓN',
        order: 60,
    },
    Roles: {
        route: '/admin/roles',
        requires: 'READ roles',
        icon: 'shield',
        group: 'GESTIÓN',
        order: 70,
    },
    Organizaciones: {
        route: '/admin/organizaciones',
        requires: 'READ organizations',
        icon: 'building-2',
        group: 'GESTIÓN',
        order: 80,
    },
    Departamentos: {
        route: '/admin/departamentos',
        requires: 'READ departments',
        icon: 'building-2',
        group: 'GESTIÓN',
        order: 82,
    },
    'Auditoría de Acceso': {
        route: '/admin/audit-logs',
        requires: 'READ audit-logs',
        icon: 'file-text',
        group: 'GESTIÓN',
        order: 85,
    },
    Categorías: {
        route: '/categorias',
        requires: 'READ incident-categories',
        icon: 'tag',
        group: 'CATÁLOGOS',
        order: 90,
    },
    Ubicaciones: {
        route: '/ubicaciones',
        requires: 'READ geo-zones',
        icon: 'map-pin',
        group: 'CATÁLOGOS',
        order: 100,
    },
};
//# sourceMappingURL=menu-map.js.map