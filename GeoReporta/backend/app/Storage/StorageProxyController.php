<?php

declare(strict_types=1);

namespace App\Storage;

use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Proxy para servir archivos desde S3-compatible storage (RustFS).
 *
 * Patrón idéntico a JASRAPO-BACKEND StorageProxyController:
 * - URLs estables con Cache-Control: immutable
 * - Sin presigned URLs que expiran
 * - Cacheable por el navegador por 1 año (UUID cambia = URL cambia)
 *
 * Las "/" en el key S3 se codifican como "--" en la URL.
 * Ejemplo:
 *   Key real: images/42/uuid.jpg
 *   URL:      /storage/images--42--uuid--jpg
 */
class StorageProxyController
{
    public function __construct(private readonly StorageService $storage) {}

    public function serve(string $path): StreamedResponse
    {
        // Revert "--" → "/"
        $key = str_replace('--', '/', $path);

        // Directory traversal protection
        if (str_contains($key, '..')) {
            abort(404);
        }

        $contentType = $this->storage->getContentType($key);

        try {
            $stream = $this->storage->getObjectStream($key);
        } catch (\Throwable $e) {
            Log::warning('storage.proxy_stream_failed', [
                'method' => __METHOD__,
                'key' => $key,
                'exception' => $e->getMessage(),
                'exception_class' => get_class($e),
            ]);

            abort(404);
        }

        return new StreamedResponse(
            function () use ($stream): void {
                if ($stream) {
                    fpassthru($stream);
                    fclose($stream);
                }
            },
            200,
            [
                'Content-Type' => $contentType,
                'Cache-Control' => 'public, max-age=31536000, immutable',
                'ETag' => '"'.$key.'"',
            ],
        );
    }
}
