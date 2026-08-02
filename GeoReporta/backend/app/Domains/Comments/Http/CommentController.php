<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http;

use App\Domains\Comments\Http\Policies\CommentPolicy;
use App\Domains\Comments\Http\Requests\StoreCommentRequest;
use App\Domains\Comments\Http\Requests\UpdateCommentRequest;
use App\Domains\Comments\Http\Resources\CommentCollection;
use App\Domains\Comments\Http\Resources\CommentResource;
use App\Domains\Comments\Models\Comment;
use App\Domains\Comments\Repositories\CommentRepository;
use App\Domains\Incidents\Models\Incident;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CommentController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly CommentRepository $comments,
    ) {
        // Wires resource-level policy checks for every method:
        //   index   → viewAny  (PermissionPolicy::viewAny → comments.view)
        //   show    → view     (PermissionPolicy::view    → comments.view)
        //   store   → create   (PermissionPolicy::create  → comments.create)
        //   update  → update   (CommentPolicy::update     → owner OR comments.update)
        //   destroy → delete   (CommentPolicy::delete     → owner OR comments.delete)
        // The route param name is 'comment' (see routes/api.php:58 — Route::apiResource
        // generates member routes at /api/comments/{comment} via shallow()).
        $this->authorizeResource(Comment::class, 'comment');
    }

    public function index(Request $request, Incident $incident): CommentCollection
    {
        $this->authorizeIncidentOrgScope($incident);

        $comments = $this->comments->paginate(
            filters: ['incident_id' => $incident->id],
            perPage: (int) $request->integer('per_page', 20),
        );

        return new CommentCollection($comments);
    }

    public function store(StoreCommentRequest $request, Incident $incident): JsonResponse
    {
        $this->authorizeIncidentOrgScope($incident);

        $parentId = $request->input('parent_id');

        if ($parentId !== null) {
            $parent = Comment::with('parent')->findOrFail($parentId);

            // Parent must belong to the same incident
            if ($parent->incident_id !== $incident->id) {
                abort(422, 'El comentario al que intentas responder pertenece a otra incidencia.');
            }

            // Depth must be < 2 (max 2 levels: top-level = 0, first reply = 1, second reply = 2)
            if ($parent->depth >= 2) {
                abort(422, 'No se puede responder a un comentario de segundo nivel.');
            }
        }

        $comment = $this->comments->create([
            'incident_id' => $incident->id,
            'user_id' => auth()->id(),
            'message' => $request->input('message'),
            'parent_id' => $parentId,
        ]);

        $comment->load(['user', 'images', 'parent', 'replies']);

        return (new CommentResource($comment))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Comment $comment): CommentResource
    {
        $comment->load('user');

        return new CommentResource($comment);
    }

    public function update(UpdateCommentRequest $request, Comment $comment): CommentResource
    {
        $this->comments->update($comment->id, [
            'message' => $request->input('message'),
        ]);

        $comment = $comment->fresh();
        $comment->load('user');

        return new CommentResource($comment);
    }

    public function destroy(Comment $comment): JsonResponse
    {
        $this->comments->delete($comment->id);

        return response()->json(null, 204);
    }

    /**
     * viewAny/create (index/store) never receive the parent Incident via
     * Laravel's authorizeResource wiring, so CommentPolicy can't org-scope
     * them — the check runs here against the resolved route param, but the
     * rule itself lives in CommentPolicy::hasOrgAccess (single owner).
     */
    private function authorizeIncidentOrgScope(Incident $incident): void
    {
        $user = auth()->user();

        if ($user === null) {
            abort(401);
        }

        if (! CommentPolicy::hasOrgAccess($user, $incident->organization_id)) {
            abort(403, 'No tienes acceso a los comentarios de esta organización.');
        }
    }
}
