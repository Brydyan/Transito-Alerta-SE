<?php

declare(strict_types=1);

namespace App\Storage;

use App\Domains\Comments\Models\Comment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Backfills the polymorphic `images` table (WU2) from the three legacy
 * per-domain image storage locations (image-persistence-polymorphic, WU3).
 *
 * Additive only: the legacy `incidents.images` JSON column, `comment_images`
 * table, and `users.profile_image_path` column are left untouched — dropping
 * them is WU8, after the read/write cutover (WU5-WU7) lands.
 *
 * Idempotent: dedupe key is `(imageable_type, imageable_id, storage_path)`.
 * Running any `backfill*` method again for a source that was already
 * backfilled skips already-migrated rows instead of duplicating them.
 */
class ImageBackfiller
{
    /**
     * Backfill `images` rows from `incidents.images` (JSON column).
     *
     * D5: `is_thumbnail` is derived from array position (index 0), NOT the
     * stored JSON flag — `IncidentResource` displays `$images[0]` as the
     * thumbnail today regardless of the flag, so deriving from index is
     * what preserves each incident's currently-visible thumbnail.
     *
     * Read via the query builder, not the Eloquent `Incident` model: since
     * the post-WU8 property-collision fix, `Incident::$fillable`/`casts()`
     * no longer declare `images` (that stale entry shadowed the
     * `images(): MorphMany` relation on property access). The raw legacy
     * JSON column therefore has to be read and decoded manually here —
     * exactly the same pattern `backfillComments()` already uses for the
     * legacy `comment_images` table — so this method keeps working
     * correctly in any environment that has not yet run WU8's drop
     * migration.
     *
     * @return array{source_count:int, created_count:int, legacy_url_rows:array<int,array{imageable_id:int,storage_path:string}>}
     */
    public function backfillIncidents(): array
    {
        $sourceCount = 0;
        $createdCount = 0;
        $legacyUrlRows = [];

        if (! Schema::hasColumn('incidents', 'images')) {
            return [
                'source_count' => 0,
                'created_count' => 0,
                'legacy_url_rows' => [],
            ];
        }

        DB::table('incidents')
            ->select('id', 'images')
            ->whereNotNull('images')
            ->orderBy('id')
            ->chunkById(100, function ($rows) use (&$sourceCount, &$createdCount, &$legacyUrlRows): void {
                $incidents = Incident::query()
                    ->whereIn('id', $rows->pluck('id'))
                    ->get()
                    ->keyBy('id');

                foreach ($rows as $row) {
                    $incident = $incidents->get($row->id);

                    if ($incident === null) {
                        continue;
                    }

                    $images = array_values(json_decode($row->images, true) ?? []);

                    foreach ($images as $index => $img) {
                        $path = $img['path'] ?? null;

                        if ($path === null) {
                            continue;
                        }

                        $sourceCount++;

                        if ($this->alreadyBackfilled($incident, $path)) {
                            continue;
                        }

                        // Incident paths are always server-generated bare keys
                        // (StorageService::uploadImage never returns an
                        // absolute URL), but the check is still run for
                        // defense-in-depth/consistency with the other sources.
                        $this->flagLegacyAbsoluteUrl('incident', $incident->id, $path, $legacyUrlRows);

                        $size = $img['size'] ?? null;

                        $incident->images()->create([
                            'storage_path' => $path,
                            'original_name' => $img['original_name'] ?? null,
                            'mime_type' => $img['mime_type'] ?? null,
                            'size' => is_int($size) ? $size : null,
                            'is_thumbnail' => $index === 0,
                            'sort_order' => $index,
                        ]);

                        $createdCount++;
                    }
                }
            });

        return [
            'source_count' => $sourceCount,
            'created_count' => $createdCount,
            'legacy_url_rows' => $legacyUrlRows,
        ];
    }

    /**
     * Backfill `images` rows from `comment_images`.
     *
     * `comment_images.url` already holds a bare storage key for
     * current-format rows (e.g. `comments/42/uuid.webp`) — this is a
     * verbatim column rename for the bulk of rows. Any row whose value
     * starts with `http://`/`https://` is a legacy absolute URL: it is
     * copied verbatim into `storage_path` (never guessed into a bare key)
     * and reported via `legacy_url_rows` (D9).
     *
     * @return array{source_count:int, created_count:int, legacy_url_rows:array<int,array{imageable_id:int,storage_path:string}>}
     */
    public function backfillComments(): array
    {
        $sourceCount = 0;
        $createdCount = 0;
        $legacyUrlRows = [];

        if (! Schema::hasTable('comment_images')) {
            return [
                'source_count' => 0,
                'created_count' => 0,
                'legacy_url_rows' => [],
            ];
        }

        // Read via the query builder, not an Eloquent model: `CommentImage`
        // was deleted in the WU6 cutover (comments now write to the
        // shared `images` table), but the legacy `comment_images` table
        // itself is untouched until WU8 drops it, so it must still be
        // readable here.
        DB::table('comment_images')->orderBy('id')->chunkById(100, function ($commentImages) use (&$sourceCount, &$createdCount, &$legacyUrlRows): void {
            foreach ($commentImages as $commentImage) {
                $sourceCount++;

                $comment = Comment::find($commentImage->comment_id);

                if ($comment === null) {
                    continue;
                }

                if ($this->alreadyBackfilled($comment, $commentImage->url)) {
                    continue;
                }

                $this->flagLegacyAbsoluteUrl('comment', $comment->id, $commentImage->url, $legacyUrlRows);

                $comment->images()->create([
                    'storage_path' => $commentImage->url,
                    'caption' => $commentImage->caption,
                    'sort_order' => $commentImage->sort_order,
                ]);

                $createdCount++;
            }
        });

        return [
            'source_count' => $sourceCount,
            'created_count' => $createdCount,
            'legacy_url_rows' => $legacyUrlRows,
        ];
    }

    /**
     * Backfill at most one `images` row per user from
     * `users.profile_image_path`. An avatar is definitionally its own
     * thumbnail, so `is_thumbnail` is always `true`.
     *
     * @return array{source_count:int, created_count:int, legacy_url_rows:array<int,array{imageable_id:int,storage_path:string}>}
     */
    public function backfillUsers(): array
    {
        $sourceCount = 0;
        $createdCount = 0;

        if (! Schema::hasColumn('users', 'profile_image_path')) {
            return [
                'source_count' => 0,
                'created_count' => 0,
                'legacy_url_rows' => [],
            ];
        }

        User::query()
            ->whereNotNull('profile_image_path')
            ->chunkById(100, function ($users) use (&$sourceCount, &$createdCount): void {
                foreach ($users as $user) {
                    $sourceCount++;

                    if ($this->alreadyBackfilled($user, $user->profile_image_path)) {
                        continue;
                    }

                    $user->avatarImage()->create([
                        'storage_path' => $user->profile_image_path,
                        'is_thumbnail' => true,
                        'sort_order' => 0,
                    ]);

                    $createdCount++;
                }
            });

        return [
            'source_count' => $sourceCount,
            'created_count' => $createdCount,
            'legacy_url_rows' => [],
        ];
    }

    /**
     * Counts LEGACY source rows that do NOT yet have a matching `images`
     * row, WITHOUT writing anything. Backs `images:backfill --verify` and
     * the `drop_legacy_image_storage` migration's guard.
     *
     * This is deliberately a per-row "every legacy row has been
     * backfilled" (source ⊆ target) check, NOT an aggregate
     * `source_count === target_count` comparison. Once the WU5-WU7 cutover
     * code is live, every NEW image write goes directly to `images` and
     * never touches the legacy source at all, so `images` legitimately
     * accumulates rows beyond what backfill created. An aggregate count
     * comparison would treat that normal growth as a permanent, unfixable
     * mismatch and block the drop forever — this per-row check does not,
     * because it only asks whether SOURCE rows are covered, using the exact
     * same `alreadyBackfilled()` matching logic the real backfill uses.
     *
     * @return array{unbackfilled_count:int, samples:array<int,array{imageable_id:int,storage_path:string}>}
     */
    public function verify(string $source): array
    {
        return match ($source) {
            'incidents' => $this->verifyIncidents(),
            'comments' => $this->verifyComments(),
            'users' => $this->verifyUsers(),
            default => throw new \InvalidArgumentException("Unknown backfill source: {$source}"),
        };
    }

    /**
     * Read via the query builder for the same reason `backfillIncidents()`
     * does (see its docblock): `Incident::$fillable`/`casts()` no longer
     * declare `images`, so the raw legacy JSON column is decoded manually.
     *
     * @return array{unbackfilled_count:int, samples:array<int,array{imageable_id:int,storage_path:string}>}
     */
    private function verifyIncidents(): array
    {
        $unbackfilledCount = 0;
        $samples = [];

        DB::table('incidents')
            ->select('id', 'images')
            ->whereNotNull('images')
            ->orderBy('id')
            ->chunkById(100, function ($rows) use (&$unbackfilledCount, &$samples): void {
                $incidents = Incident::query()
                    ->whereIn('id', $rows->pluck('id'))
                    ->get()
                    ->keyBy('id');

                foreach ($rows as $row) {
                    $incident = $incidents->get($row->id);

                    if ($incident === null) {
                        continue;
                    }

                    foreach (array_values(json_decode($row->images, true) ?? []) as $img) {
                        $path = $img['path'] ?? null;

                        if ($path === null) {
                            continue;
                        }

                        if ($this->alreadyBackfilled($incident, $path)) {
                            continue;
                        }

                        $unbackfilledCount++;
                        $this->addSample($samples, $incident->id, $path);
                    }
                }
            });

        return ['unbackfilled_count' => $unbackfilledCount, 'samples' => $samples];
    }

    /**
     * @return array{unbackfilled_count:int, samples:array<int,array{imageable_id:int,storage_path:string}>}
     */
    private function verifyComments(): array
    {
        $unbackfilledCount = 0;
        $samples = [];

        DB::table('comment_images')->orderBy('id')->chunkById(100, function ($commentImages) use (&$unbackfilledCount, &$samples): void {
            foreach ($commentImages as $commentImage) {
                $comment = Comment::find($commentImage->comment_id);

                if ($comment === null) {
                    continue;
                }

                if ($this->alreadyBackfilled($comment, $commentImage->url)) {
                    continue;
                }

                $unbackfilledCount++;
                $this->addSample($samples, $comment->id, $commentImage->url);
            }
        });

        return ['unbackfilled_count' => $unbackfilledCount, 'samples' => $samples];
    }

    /**
     * @return array{unbackfilled_count:int, samples:array<int,array{imageable_id:int,storage_path:string}>}
     */
    private function verifyUsers(): array
    {
        $unbackfilledCount = 0;
        $samples = [];

        User::query()
            ->whereNotNull('profile_image_path')
            ->chunkById(100, function ($users) use (&$unbackfilledCount, &$samples): void {
                foreach ($users as $user) {
                    if ($this->alreadyBackfilled($user, $user->profile_image_path)) {
                        continue;
                    }

                    $unbackfilledCount++;
                    $this->addSample($samples, $user->id, $user->profile_image_path);
                }
            });

        return ['unbackfilled_count' => $unbackfilledCount, 'samples' => $samples];
    }

    /**
     * @param  array<int,array{imageable_id:int,storage_path:string}>  $samples
     */
    private function addSample(array &$samples, int $imageableId, string $storagePath): void
    {
        if (count($samples) >= 5) {
            return;
        }

        $samples[] = ['imageable_id' => $imageableId, 'storage_path' => $storagePath];
    }

    private function alreadyBackfilled(Model $owner, string $storagePath): bool
    {
        $query = Image::query()
            ->where('imageable_type', $owner->getMorphClass())
            ->where('imageable_id', $owner->getKey());

        if ($owner instanceof User) {
            return $query->exists();
        }

        return $query->where('storage_path', $storagePath)->exists();
    }

    /**
     * @param  array<int,array{imageable_id:int,storage_path:string}>  $legacyUrlRows
     */
    private function flagLegacyAbsoluteUrl(string $source, int $imageableId, string $value, array &$legacyUrlRows): void
    {
        if (! str_starts_with($value, 'http://') && ! str_starts_with($value, 'https://')) {
            return;
        }

        $legacyUrlRows[] = ['imageable_id' => $imageableId, 'storage_path' => $value];

        Log::warning('[ImageBackfiller] Legacy absolute URL copied verbatim', [
            'source' => $source,
            'imageable_id' => $imageableId,
            'storage_path' => $value,
        ]);
    }
}
