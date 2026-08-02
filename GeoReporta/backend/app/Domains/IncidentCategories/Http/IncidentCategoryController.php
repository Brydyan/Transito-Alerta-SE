<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Http;

use App\Domains\IncidentCategories\Http\Requests\StoreIncidentCategoryRequest;
use App\Domains\IncidentCategories\Http\Requests\UpdateIncidentCategoryRequest;
use App\Domains\IncidentCategories\Http\Resources\IncidentCategoryCollection;
use App\Domains\IncidentCategories\Http\Resources\IncidentCategoryResource;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\IncidentCategories\Repositories\IncidentCategoryRepository;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class IncidentCategoryController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly IncidentCategoryRepository $categories)
    {
        $this->authorizeResource(IncidentCategory::class, 'incident_category');
    }

    public function tree(): JsonResponse
    {
        $tree = $this->categories->tree();

        return response()->json(['data' => IncidentCategoryResource::collection($tree)]);
    }

    public function index(Request $request): JsonResponse
    {
        $categories = $this->categories->paginate(
            $request->only(['search', 'parent_id', 'per_page']),
        );

        return (new IncidentCategoryCollection($categories))->response();
    }

    public function store(StoreIncidentCategoryRequest $request): JsonResponse
    {
        $category = $this->categories->create($request->validated());

        return (new IncidentCategoryResource($category))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(int $id): JsonResponse
    {
        $category = $this->categories->findById($id);

        if ($category === null) {
            return response()->json(['message' => __('messages.category_not_found')], Response::HTTP_NOT_FOUND);
        }

        return (new IncidentCategoryResource($category))->response();
    }

    public function update(UpdateIncidentCategoryRequest $request, int $id): JsonResponse
    {
        $category = $this->categories->update($id, $request->validated());

        return (new IncidentCategoryResource($category))->response();
    }

    public function destroy(int $id): JsonResponse
    {
        $this->categories->delete($id);

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }
}
