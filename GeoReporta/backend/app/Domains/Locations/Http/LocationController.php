<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http;

use App\Domains\Locations\Http\Requests\StoreLocationRequest;
use App\Domains\Locations\Http\Requests\UpdateLocationRequest;
use App\Domains\Locations\Http\Resources\LocationCollection;
use App\Domains\Locations\Http\Resources\LocationResource;
use App\Domains\Locations\Models\Location;
use App\Domains\Locations\Repositories\LocationRepository;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class LocationController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly LocationRepository $locations)
    {
        $this->authorizeResource(Location::class, 'location');
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['search', 'level', 'parent_id', 'per_page']);

        if (($filters['level'] ?? false) && ! ($filters['search'] ?? false) && ! isset($filters['per_page'])) {
            $filters['per_page'] = 500;
        }

        $locations = $this->locations->paginate($filters);

        return (new LocationCollection($locations))->response();
    }

    public function store(StoreLocationRequest $request): JsonResponse
    {
        $location = $this->locations->create($request->validated());

        return (new LocationResource($location))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(int $id): JsonResponse
    {
        $location = $this->locations->findById($id);

        if ($location === null) {
            return response()->json(['message' => __('messages.location_not_found')], Response::HTTP_NOT_FOUND);
        }

        return (new LocationResource($location))->response();
    }

    public function update(UpdateLocationRequest $request, int $id): JsonResponse
    {
        $location = $this->locations->update($id, $request->validated());

        return (new LocationResource($location))->response();
    }

    public function destroy(int $id): JsonResponse
    {
        $this->locations->delete($id);

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }
}
