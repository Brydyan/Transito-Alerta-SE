<?php

declare(strict_types=1);

namespace App\Domains\Roles\Enums;

enum UserRole: string
{
    case AdminSistema = 'admin_sistema';
    case OperadorSistema = 'operador_sistema';
    case AdminOrganizacion = 'admin_organizacion';
    case OperadorOrganizacion = 'operador_organizacion';
    case Usuario = 'usuario';
    case AdminLegacy = 'Admin';
}
