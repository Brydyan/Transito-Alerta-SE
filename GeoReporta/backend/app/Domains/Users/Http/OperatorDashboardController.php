<?php

declare(strict_types=1);

namespace App\Domains\Users\Http;

use App\Domains\Users\Services\OperatorDashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class OperatorDashboardController extends Controller
{
    public function __construct(
        private readonly OperatorDashboardService $dashboard,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null || ! $user->isOperator() || ! $user->can('dashboard.view')) {
            abort(403, __('messages.unauthorized'));
        }

        $filters = $request->validate([
            'inicio' => ['nullable', 'date_format:Y-m-d'],
            'fin' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:inicio'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        return response()->json($this->dashboard->forOperator($user, $filters));
    }
}
