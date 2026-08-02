<?php

declare(strict_types=1);

namespace App\Storage;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Format;
use Intervention\Image\ImageManager;

/**
 * Shared image processing service (webp encode + resize/crop) used by
 * every domain that stores images (incidents, comments, users).
 *
 * Moved from App\Domains\Comments\Services\ImageProcessingService — the
 * previous location made Users\Services\ProfileImageService import a
 * Comments-domain class, a cross-domain coupling this move removes.
 */
class ImageProcessor
{
    private const MAX_DIMENSION = 1920;

    private const WEBP_QUALITY = 85;

    public function processUploadedImage(UploadedFile $file, int $commentId): string
    {
        $manager = new ImageManager(Driver::class);

        $uuid = (string) Str::uuid();

        $path = sprintf('comments/%d/%s.webp', $commentId, $uuid);

        try {
            $image = $manager->decodePath($file->getRealPath());

            $image->scaleDown(self::MAX_DIMENSION, self::MAX_DIMENSION);

            $encoded = $image->encodeUsingFormat(Format::WEBP, self::WEBP_QUALITY);

            Storage::disk($this->storageDisk())->put($path, (string) $encoded);
        } catch (\Throwable $e) {
            throw new \RuntimeException(
                sprintf('Failed to process image for comment %d: %s', $commentId, $e->getMessage()),
                previous: $e
            );
        }

        return $path;
    }

    /**
     * Process a user profile image: centered 512×512 WebP crop.
     */
    public function processUserImage(UploadedFile $file, int $userId): string
    {
        $manager = new ImageManager(Driver::class);

        $uuid = (string) Str::uuid();

        $path = sprintf('users/%d/%s.webp', $userId, $uuid);

        try {
            $image = $manager->decodePath($file->getRealPath());

            // Center-crop to exactly 512×512
            $image->cover(512, 512);

            $encoded = $image->encodeUsingFormat(Format::WEBP, self::WEBP_QUALITY);

            Storage::disk($this->storageDisk())->put($path, (string) $encoded);
        } catch (\Throwable $e) {
            throw new \RuntimeException(
                sprintf('Failed to process user image for user %d: %s', $userId, $e->getMessage()),
                previous: $e
            );
        }

        return $path;
    }

    private function storageDisk(): string
    {
        return config('filesystems.image_disk');
    }
}
