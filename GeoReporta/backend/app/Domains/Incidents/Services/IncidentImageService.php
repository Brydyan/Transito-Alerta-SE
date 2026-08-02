<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Services;

use App\Domains\Incidents\Models\Incident;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;

/**
 * Sube las imágenes de una incidencia contra la tabla polimórfica `images`
 * (image-persistence-polymorphic, WU5), delegando en ImageStorageService.
 * La columna JSON legacy `images` del modelo Incident queda sin uso desde
 * este cutover — WU8 la elimina junto con las demás columnas/tablas legacy.
 */
class IncidentImageService
{
    public function __construct(
        private readonly ImageStorageService $images,
    ) {}

    /**
     * @param  array<int, UploadedFile>|UploadedFile|null  $files
     * @return Collection<int, Image>
     */
    public function upload(array|UploadedFile|null $files, Incident $incident, bool $firstIsThumbnail): Collection
    {
        $files = is_array($files) ? $files : ($files ? [$files] : []);
        $files = array_values(array_filter($files));

        if (empty($files)) {
            return new Collection;
        }

        // Appends after any images the incident already has — sort_order
        // must continue, not restart at 0, or a second upload batch would
        // collide with the first one's ordering.
        $startOrder = $incident->images()->count();

        $result = new Collection;

        foreach ($files as $i => $file) {
            $result->push($this->images->attach(
                owner: $incident,
                file: $file,
                sortOrder: $startOrder + $i,
                isThumbnail: $firstIsThumbnail && $i === 0,
            ));
        }

        return $result;
    }
}
