<?php

declare(strict_types=1);

use App\Storage\ImageBackfiller;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the three legacy per-domain image storage locations superseded by
 * the polymorphic `images` table (image-persistence-polymorphic, WU2-WU7):
 * `incidents.images` (JSON column), `comment_images` (table), and
 * `users.profile_image_path` (column).
 *
 * IRREVERSIBLE ONCE REAL DATA EXISTS: `down()` recreates the empty legacy
 * shapes, but cannot restore any dropped rows. Take a DB snapshot before
 * this runs in any environment with real data.
 *
 * Self-guarding (WU8, closing the WU3-verify WARNING 2 gap — "no enforced
 * operator signal that `images:backfill` must run before WU8 drops legacy
 * columns"): aborts BEFORE dropping anything unless `ImageBackfiller::
 * verify()` reports zero un-backfilled rows for all three sources.
 * `php artisan migrate` runs unattended on every deploy (Swarm entrypoint)
 * — without this guard, a deploy where an operator forgot to run
 * `images:backfill` first would silently destroy any un-migrated legacy
 * image data. On a fresh/empty database (dev, CI, new installs) every
 * source trivially has zero legacy rows, so the guard passes and the drop
 * proceeds immediately, same as any other migration.
 *
 * NOTE (bug fixed post-WU8): the guard originally compared an AGGREGATE
 * `source_count === target_count`. That is wrong once the WU5-WU7 cutover
 * code has been running for any amount of time: every new image write
 * after cutover goes straight to `images` and never touches the legacy
 * source, so `target_count` grows past `source_count` forever in any
 * environment with real post-cutover usage — the aggregate check could
 * never pass again and would permanently block this migration. The guard
 * now checks the correct invariant instead: every LEGACY row has already
 * been backfilled into a matching `images` row (source ⊆ target, matched
 * per-row via `ImageBackfiller::alreadyBackfilled()`), so extra `images`
 * rows from normal post-cutover uploads are expected and do not block.
 *
 * Recovery: if this migration aborts, it throws BEFORE any schema change,
 * so the legacy schema is left completely intact and this migration is
 * NOT marked as run. Run `php artisan images:backfill` (confirm with
 * `--verify`), then re-run `php artisan migrate` to retry.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->guardBackfillIsClean();

        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropColumn('images');
        });

        Schema::dropIfExists('comment_images');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('profile_image_path');
        });
    }

    /**
     * @throws RuntimeException if any source still has un-backfilled rows
     */
    private function guardBackfillIsClean(): void
    {
        $backfiller = app(ImageBackfiller::class);
        $mismatches = [];

        foreach (['incidents', 'comments', 'users'] as $source) {
            $stats = $backfiller->verify($source);

            if ($stats['unbackfilled_count'] > 0) {
                $mismatches[] = sprintf(
                    '%s (%d unbackfilled row(s))',
                    $source,
                    $stats['unbackfilled_count']
                );
            }
        }

        if ($mismatches !== []) {
            throw new RuntimeException(
                'Refusing to drop legacy image storage: backfill is not clean for: '
                .implode(', ', $mismatches)
                .'. Run `php artisan images:backfill` (and confirm with `--verify`) before retrying this migration.'
            );
        }
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table): void {
            $table->json('images')->nullable()->after('geom');
        });

        Schema::create('comment_images', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('comment_id')
                ->constrained('comments')
                ->cascadeOnDelete();
            $table->string('url');
            $table->string('caption')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('comment_id', 'comment_images_comment_id_index');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->string('profile_image_path')->nullable()->after('avatar');
        });
    }
};
