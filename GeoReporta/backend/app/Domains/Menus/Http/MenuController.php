<?php

declare(strict_types=1);

namespace App\Domains\Menus\Http;

use App\Domains\Menus\Services\MenuService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MenuController
{
    public function __construct(
        private readonly MenuService $menuService,
    ) {}

    public function myMenus(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->menuService->getMyMenus($request->user()),
        ]);
    }
}
