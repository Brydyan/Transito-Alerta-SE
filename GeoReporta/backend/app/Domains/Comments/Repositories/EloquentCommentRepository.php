<?php

declare(strict_types=1);

namespace App\Domains\Comments\Repositories;

use App\Domains\Comments\Models\Comment;
use App\Domains\Shared\Repositories\EloquentRepository;
use Illuminate\Database\Eloquent\Builder;

class EloquentCommentRepository extends EloquentRepository implements CommentRepository
{
    public function __construct()
    {
        parent::__construct(new Comment);
    }

    protected function applyFilters(Builder $query, array $filters): void
    {
        $query
            ->when(
                array_key_exists('parent_id', $filters),
                fn (Builder $q) => $filters['parent_id'] === null ? $q->whereNull('parent_id') : $q->where('parent_id', $filters['parent_id']),
                fn (Builder $q) => $q->whereNull('parent_id')
            )
            ->when($filters['incident_id'] ?? null, fn (Builder $q, $v) => $q->where('incident_id', $v))
            ->with([
                'user',
                'images',
                'replies',
                'replies.user',
                'replies.images',
                'replies.replies',
                'replies.replies.user',
                'replies.replies.images',
            ])
            ->orderBy('created_at', 'desc');
    }
}
