<?php

declare(strict_types=1);

namespace App\Storage;

use Aws\S3\S3Client;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Object storage service.
 *
 * Uses the configured FILESYSTEM_STORAGE_DISK env var (default: 's3').
 * Designed for S3-compatible storage (AWS S3, MinIO, RustFS) via a single endpoint.
 * Falls back to local disk when 'public' is explicitly set.
 *
 * @see https://laravel.com/docs/filesystem#s3-driver-configuration
 */
class StorageService
{
    private const IMAGES_DIR = 'images';

    /**
     * The storage disk to use (from env, default 'public').
     */
    private function disk(): string
    {
        return config('filesystems.image_disk');
    }

    /**
     * Check if the configured disk supports S3-style operations.
     */
    private function isS3(): bool
    {
        return $this->disk() === 's3';
    }

    /**
     * Ensure the required bucket exists (S3 only).
     * Idempotent — safe to call on every boot.
     */
    public function ensureBucketExists(): bool
    {
        if (! $this->isS3()) {
            return true; // local disk always "exists"
        }

        if (! class_exists(S3Client::class)) {
            Log::warning('[StorageService] S3 client not installed — install league/flysystem-aws-s3-v3');

            return false;
        }

        try {
            /** @var S3Client */
            $client = Storage::disk('s3')->getClient();

            if ($client->doesBucketExist(self::bucketName())) {
                return true;
            }

            $client->createBucket(['Bucket' => self::bucketName()]);

            Log::info('[StorageService] Bucket created', ['bucket' => self::bucketName()]);

            return true;
        } catch (\Throwable $e) {
            Log::warning('[StorageService] Could not ensure bucket', [
                'bucket' => self::bucketName(),
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Upload an image file to storage.
     *
     * @param  UploadedFile  $file  The uploaded file
     * @param  int  $incidentId  Incident ID for path grouping
     * @return string The storage key (e.g. "images/42/uuid.webp")
     */
    public function uploadImage(UploadedFile $file, int $incidentId): string
    {
        $uuid = (string) Str::uuid();
        $key = sprintf('%s/%d/%s.%s', self::IMAGES_DIR, $incidentId, $uuid, $file->getClientOriginalExtension());

        Storage::disk($this->disk())->put($key, (string) file_get_contents($file->getRealPath()));

        Log::debug('[StorageService] Image uploaded', [
            'key' => $key,
            'size' => $file->getSize(),
            'mime' => $file->getMimeType(),
            'disk' => $this->disk(),
        ]);

        return $key;
    }

    /**
     * Delete an object from storage.
     * Used for rollback when a DB transaction fails.
     */
    public function delete(string $key): void
    {
        Storage::disk($this->disk())->delete($key);

        Log::debug('[StorageService] Object deleted', ['key' => $key, 'disk' => $this->disk()]);
    }

    /**
     * Get a readable stream for a storage object.
     *
     * @return resource
     */
    public function getObjectStream(string $key)
    {
        return Storage::disk($this->disk())->readStream($key);
    }

    /**
     * Get the content type of a storage object.
     */
    public function getContentType(string $key): string
    {
        if (! Storage::disk($this->disk())->exists($key)) {
            return self::resolveContentType($key);
        }

        $mime = Storage::disk($this->disk())->mimeType($key);

        return $mime ?: self::resolveContentType($key);
    }

    /**
     * Generate a stable URL for the StorageProxyController.
     *
     * Ejemplo: /storage/incidencias/images--42--uuid--webp
     */
    public function proxyUrl(string $key): string
    {
        $safeKey = str_replace('/', '--', $key);

        return "/storage/{$safeKey}";
    }

    /**
     * Resolve MIME type from file extension.
     */
    public static function resolveContentType(string $key): string
    {
        $ext = strtolower(pathinfo($key, PATHINFO_EXTENSION));

        return match ($ext) {
            'webp' => 'image/webp',
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'avif' => 'image/avif',
            'pdf' => 'application/pdf',
            default => 'application/octet-stream',
        };
    }

    /**
     * Get the configured bucket (for S3) or 'local' placeholder.
     */
    public static function bucketName(): string
    {
        return env('AWS_BUCKET', 'incidencias');
    }
}
