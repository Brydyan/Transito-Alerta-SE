<?php

declare(strict_types=1);

namespace App\Domains\Users\Services;

use App\Domains\Users\Models\User;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

/**
 * Thin domain-facing wrapper around the shared `ImageStorageService`
 * (image-persistence-polymorphic, WU7 cutover). Users only ever have one
 * avatar, so this delegates entirely to `replaceSingle()`/`detach()` —
 * no direct `Storage`/`ImageProcessor` access here anymore, and
 * `users.profile_image_path` is no longer written by either method (dead
 * column left in place for WU8 to drop).
 */
class ProfileImageService
{
    public function __construct(
        private readonly ImageStorageService $images,
    ) {}

    /**
     * Replace the user's avatar via the shared `images` table, leaving
     * exactly one row/object for the user once it completes — see
     * `ImageStorageService::replaceSingle()` for the swap guarantee.
     */
    public function replaceAvatar(User $user, UploadedFile $file): Image
    {
        return $this->images->replaceSingle($user, $file);
    }

    /**
     * Remove the user's avatar: detaches the `images` row and its storage
     * object together. No-op when the user has no avatar. Mirrors the
     * pre-cutover behavior of tolerating S3 delete failures: the row is
     * always cleared (avatar is gone from the user's perspective) even if
     * the underlying object can't be deleted — that failure is logged,
     * not raised, so it never turns a successful removal into a 500.
     */
    public function removeAvatar(User $user): void
    {
        $avatar = $user->avatarImage;

        if ($avatar !== null) {
            try {
                $this->images->detach($avatar);
            } catch (\Throwable $e) {
                Log::warning('Failed to delete image file from S3', [
                    'path' => $avatar->storage_path,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
