<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Polymorphic `images` table (image-persistence-polymorphic, WU2).
 *
 * One row per stored image, owned by any morph-mapped model (`incident`,
 * `comment`, `user` — see `Relation::enforceMorphMap` in
 * `AppServiceProvider::boot()`). Replaces the per-domain
 * `incidents.images` JSON column, `comment_images` table, and
 * `users.profile_image_path` string (cutover happens in later work
 * units; this migration only adds the new table).
 *
 * D4: a partial unique index enforces at most one `is_thumbnail = true`
 * row per `(imageable_type, imageable_id)` pair at the database level.
 * Verified working under both SQLite (>= 3.8, partial index support) and
 * PostgreSQL — no per-driver skip needed here, unlike the CHECK-constraint
 * precedent in `2026_07_09_000001_add_partial_unique_responsable_to_assignments.php`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('images', function (Blueprint $table) {
            $table->id();
            $table->string('imageable_type');
            $table->unsignedBigInteger('imageable_id');
            $table->string('storage_path');
            $table->string('original_name')->nullable();
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->boolean('is_thumbnail')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('caption')->nullable();
            $table->timestamps();

            $table->index(
                ['imageable_type', 'imageable_id', 'sort_order'],
                'images_imageable_sort_order_index'
            );
        });

        DB::statement(
            'CREATE UNIQUE INDEX images_one_thumbnail_per_owner '
            .'ON images (imageable_type, imageable_id) WHERE is_thumbnail = true'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('images');
    }
};
