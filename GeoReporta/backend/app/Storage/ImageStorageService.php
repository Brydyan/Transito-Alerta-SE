<?php

declare(strict_types=1);

namespace App\Storage;

use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Shared attach/detach abstraction for the polymorphic `images` table,
 * used by every domain that stores images (incidents, comments, users).
 * Wired into incidents (WU5, default 'gallery' profile), comments (WU6,
 * 'comment' profile), and users' avatar (WU7, 'avatar' profile via
 * `replaceSingle()`).
 *
 * D3: the object is uploaded to storage BEFORE the `images` row is
 * inserted. If the insert fails inside the transaction (e.g. the D4
 * partial-unique "one thumbnail per owner" index rejects a duplicate),
 * the just-uploaded object is compensating-deleted via
 * StorageService::delete() and the exception is rethrown. Postgres
 * cannot FK-constrain `imageable_id` (it's polymorphic), so this safety
 * net has to live in application code — an orphan object (invisible) is
 * an acceptable failure mode; a row pointing at a missing object is not.
 */
final class ImageStorageService
{
    public function __construct(
        private readonly StorageService $storage,
        private readonly ImageProcessor $imageProcessor,
    ) {}

    public function attach(
        Model $owner,
        UploadedFile $file,
        string $profile = 'gallery',
        ?int $sortOrder = null,
        bool $isThumbnail = false,
    ): Image {
        $key = $this->upload($owner, $file, $profile);

        try {
            return DB::transaction(fn (): Image => Image::create([
                'imageable_type' => $owner->getMorphClass(),
                'imageable_id' => $owner->getKey(),
                'storage_path' => $key,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize() ?: null,
                'is_thumbnail' => $isThumbnail,
                'sort_order' => $sortOrder ?? 0,
            ]));
        } catch (\Throwable $e) {
            $this->storage->delete($key);

            throw $e;
        }
    }

    /**
     * @param  array<int, UploadedFile>  $files
     */
    public function attachMany(Model $owner, array $files, bool $firstIsThumbnail, string $profile = 'gallery'): Collection
    {
        $images = new Collection;

        foreach (array_values($files) as $index => $file) {
            $images->push($this->attach(
                owner: $owner,
                file: $file,
                profile: $profile,
                sortOrder: $index,
                isThumbnail: $firstIsThumbnail && $index === 0,
            ));
        }

        return $images;
    }

    /**
     * Deletes the DB row first, then the storage object — D3's ordering
     * applied symmetrically to deletion: if the row delete commits but
     * the storage delete fails, the result is an invisible orphan object,
     * never a row pointing at a missing one.
     */
    public function detach(Image $image): void
    {
        $key = $image->storage_path;

        DB::transaction(fn () => $image->delete());

        $this->storage->delete($key);
    }

    /**
     * Replace the single existing image for an owner (e.g. a user's
     * avatar), leaving exactly one row/object once it completes. The
     * existing thumbnail flag is unset before attaching the replacement
     * so the D4 unique index doesn't reject the new row while the old
     * one still exists; on attach failure the flag is restored so the
     * owner never ends up with zero images.
     *
     * The new image is always attached first. Cleaning up the old one is
     * best-effort: `detach()` deletes its DB row before its storage
     * object (D3 ordering), so by the time a storage-delete failure can
     * happen the row is already gone — the owner correctly has exactly
     * one row. A failure here is logged and swallowed rather than
     * propagated, matching the pre-cutover `ProfileImageService`
     * behavior this method replaces: an orphaned S3 object is an
     * acceptable, invisible failure mode (per D3); failing the whole
     * request after the new avatar already saved successfully is not.
     */
    public function replaceSingle(Model $owner, UploadedFile $file, string $profile = 'avatar'): Image
    {
        $existing = Image::where('imageable_type', $owner->getMorphClass())
            ->where('imageable_id', $owner->getKey())
            ->first();

        if ($existing !== null) {
            $existing->update(['is_thumbnail' => false]);
        }

        try {
            $new = $this->attach($owner, $file, profile: $profile, sortOrder: 0, isThumbnail: true);
        } catch (\Throwable $e) {
            $existing?->update(['is_thumbnail' => true]);

            throw $e;
        }

        if ($existing !== null) {
            try {
                $this->detach($existing);
            } catch (\Throwable $e) {
                Log::warning('Failed to delete image file from S3', [
                    'path' => $existing->storage_path,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $new;
    }

    private function upload(Model $owner, UploadedFile $file, string $profile): string
    {
        return match ($profile) {
            'avatar' => $this->imageProcessor->processUserImage($file, (int) $owner->getKey()),
            // Comments keep their pre-cutover webp resize+encode step
            // (unlike incidents' 'gallery' profile, which uploads the raw
            // file untouched — that was incidents' behavior before this
            // service existed too, so it is preserved as the default).
            'comment' => $this->imageProcessor->processUploadedImage($file, (int) $owner->getKey()),
            default => $this->storage->uploadImage($file, (int) $owner->getKey()),
        };
    }
}
