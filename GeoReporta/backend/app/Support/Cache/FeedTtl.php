<?php

declare(strict_types=1);

namespace App\Support\Cache;

use App\Console\Commands\FeedRebuildCommand;
use App\Domains\Incidents\Listeners\RedisIncidentSync;

/**
 * Resuelve el TTL del feed v2 en Redis con fallback fail-safe.
 *
 * La fuente operativa es `REDIS_FEED_TTL_SECONDS`. Si llega vacía,
 * no numérica, en cero o en negativo, este resolver cae al default
 * documentado (7 días) para que `Redis::expire(..., 0|-N)` no pueda
 * borrar silenciosamente las claves `feed:v2:items` / `feed:v2:index`.
 *
 * La política vive acá (no en los call sites) para que tanto
 * {@see FeedRebuildCommand} como
 * {@see RedisIncidentSync} lean el
 * mismo valor centralizado desde `config('cache.feed_ttl_seconds')`.
 */
final class FeedTtl
{
    public const DEFAULT_SECONDS = 60 * 60 * 24 * 7; // 7 días.

    /**
     * Lee REDIS_FEED_TTL_SECONDS desde el entorno y aplica el fallback.
     *
     * Pensado para ser invocado desde `config/cache.php` durante el
     * boot del framework; en producción el resultado queda cacheado
     * por `php artisan config:cache` y se congela al primer load.
     */
    public static function fromConfig(): int
    {
        return self::resolve(env('REDIS_FEED_TTL_SECONDS'));
    }

    /**
     * Aplica la política de validación sobre un valor crudo y devuelve
     * un entero positivo, o el default si el valor es inválido.
     *
     * Casos cubiertos (todos caen al default):
     *   - null / string vacío / whitespace
     *   - no numérico (p.ej. "abc", "7d")
     *   - cero (p.ej. "0", "0.0")
     *   - negativo (p.ej. "-5")
     *
     * Valores válidos: string numérico positivo (se trunca a int).
     */
    public static function resolve(mixed $value): int
    {
        if (! is_numeric($value)) {
            return self::DEFAULT_SECONDS;
        }

        $seconds = (int) $value;

        return $seconds > 0 ? $seconds : self::DEFAULT_SECONDS;
    }
}
