<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * Lightweight endpoint for the map's filter dropdowns.
 *
 * Returns reference data (categories) that the map component needs to
 * build its filter UI.  Designed to require only authentication, not any
 * specific permission — unlike the admin-oriented incident-categories
 * endpoints which are gated by `incident-categories.view`.
 */
class MapFilterController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $categories = IncidentCategory::query()
            ->select(['id', 'name'])
            ->orderBy('name')
            ->get()
            ->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'categories' => $categories,
            ],
        ]);
    }
}
