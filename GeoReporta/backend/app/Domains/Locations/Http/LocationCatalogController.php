<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http;

use App\Domains\Locations\Http\Resources\LocationCollection;
use App\Domains\Locations\Repositories\LocationRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * Citizen-facing catalog of locations for the incident form cascade.
 *
 * Unlike LocationController::index (gated by the `locations.view`
 * administrative permission), this endpoint is intentionally permissive:
 * every authenticated role can read the province → city → neighborhood
 * catalog needed to fill the create/edit incident form. It only ever
 * returns catalog rows (level/parent_id filtered) — never mutations.
 *
 * Registered BEFORE the `locations` apiResource so `catalog` is not
 * captured as a {location} route parameter.
 */
class LocationCatalogController extends Controller
{
    public function __construct(private readonly LocationRepository $locations) {}

    public function __invoke(CatalogLocationsRequest $request): JsonResponse
    {
        $filters = $request->validated();

        if (isset($filters['level']) && ! isset($filters['per_page'])) {
            $filters['per_page'] = 500;
        }

        $locations = $this->locations->paginate($filters);

        return (new LocationCollection($locations))->response();
    }
}
