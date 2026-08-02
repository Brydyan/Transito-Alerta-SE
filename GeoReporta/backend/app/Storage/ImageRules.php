<?php

declare(strict_types=1);

namespace App\Storage;

/**
 * Single source of truth for image upload validation limits (D10),
 * shared by every domain's Request validator and mirrored by the
 * frontend's `image-uploader.js` constants so both sides stay in sync.
 */
final class ImageRules
{
    /** Max number of files per "gallery" upload (incidents, comments). */
    public const MAX_FILES = 10;

    /** Max size per file, in kilobytes (Laravel `max` rule unit). 5 MB. */
    public const MAX_SIZE_KB = 5120;

    /** Accepted MIME types (union across all domains — no rejection regression). */
    public const MIMES = ['jpeg', 'png', 'webp', 'gif'];

    /**
     * Per-file rules for a multi-image "gallery" upload profile
     * (incidents, comments).
     *
     * @return array<int, string>
     */
    public static function galleryFileRules(): array
    {
        return [
            'image',
            'mimes:'.implode(',', self::MIMES),
            'max:'.self::MAX_SIZE_KB,
        ];
    }

    /**
     * Array-level rules capping the number of files in a gallery upload.
     *
     * @return array<int, string>
     */
    public static function galleryArrayRules(): array
    {
        return [
            'array',
            'max:'.self::MAX_FILES,
        ];
    }

    /**
     * Per-file rules for a single-file avatar upload profile (users).
     * Same MIME/size limits as gallery — no file-count rule (single file).
     *
     * @return array<int, string>
     */
    public static function avatarFileRules(): array
    {
        return [
            'image',
            'mimes:'.implode(',', self::MIMES),
            'max:'.self::MAX_SIZE_KB,
        ];
    }
}
