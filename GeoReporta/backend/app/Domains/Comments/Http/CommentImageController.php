<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http;

use App\Domains\Comments\Http\Requests\StoreCommentImageRequest;
use App\Domains\Comments\Http\Resources\CommentImageResource;
use App\Domains\Comments\Models\Comment;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;

class CommentImageController
{
    public function __construct(
        private readonly ImageStorageService $images,
    ) {}

    public function store(StoreCommentImageRequest $request, Comment $comment): JsonResponse
    {
        Gate::authorize('update', $comment);

        $images = $this->images->attachMany(
            owner: $comment,
            files: $request->file('images'),
            firstIsThumbnail: false,
            profile: 'comment',
        );

        return CommentImageResource::collection($images)
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Comment $comment, Image $image): JsonResponse
    {
        Gate::authorize('update', $comment);

        if ($image->imageable_type !== $comment->getMorphClass() || $image->imageable_id !== $comment->id) {
            abort(404, 'Imagen no encontrada.');
        }

        try {
            $this->images->detach($image);
        } catch (\Throwable $e) {
            Log::warning('Failed to delete image file from S3', [
                'path' => $image->storage_path,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json(null, 204);
    }
}
