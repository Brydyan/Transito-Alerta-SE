<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Storage\ImageBackfiller;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Explicit, operator-triggered backfill of the polymorphic `images` table
 * from the three legacy image storage locations (image-persistence-polymorphic,
 * WU3): `incidents.images` (JSON), `comment_images`, `users.profile_image_path`.
 *
 * Deliberately NOT a database migration and NOT run automatically as part
 * of `php artisan migrate` (which the Swarm entrypoint runs unattended on
 * every deploy) — this is the only irreversible-adjacent, data-volume step
 * in the whole rollout, so an operator must trigger it deliberately, ideally
 * `--dry-run` and/or `--verify` first on a staging snapshot.
 */
class BackfillImages extends Command
{
    private const SOURCES = ['incidents', 'comments', 'users'];

    protected $signature = 'images:backfill {--source=} {--dry-run} {--verify}';

    protected $description = 'Backfill the polymorphic images table from incidents.images, comment_images, and users.profile_image_path';

    public function __construct(
        private readonly ImageBackfiller $backfiller,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $requestedSource = $this->option('source');

        if ($requestedSource !== null && ! in_array($requestedSource, self::SOURCES, true)) {
            $this->error(sprintf(
                'Unknown --source "%s". Expected one of: %s',
                $requestedSource,
                implode(', ', self::SOURCES)
            ));

            return self::FAILURE;
        }

        $sources = $requestedSource !== null ? [$requestedSource] : self::SOURCES;

        if ($this->option('verify')) {
            return $this->runVerify($sources);
        }

        return $this->runBackfill($sources, (bool) $this->option('dry-run'));
    }

    /**
     * @param  array<int,string>  $sources
     */
    private function runBackfill(array $sources, bool $isDryRun): int
    {
        if ($isDryRun) {
            DB::beginTransaction();
        }

        $results = [];

        foreach ($sources as $source) {
            $method = 'backfill'.ucfirst($source);
            $results[$source] = $this->backfiller->{$method}();
        }

        if ($isDryRun) {
            DB::rollBack();
        }

        foreach ($results as $source => $stats) {
            $suffix = $isDryRun ? ' (dry-run — rolled back, nothing persisted)' : '';

            $this->info(sprintf(
                '%s: %d source row(s), %d image(s) created%s',
                $source,
                $stats['source_count'],
                $stats['created_count'],
                $suffix
            ));

            if (! empty($stats['legacy_url_rows'])) {
                $this->warn(sprintf(
                    '%d legacy absolute-URL row(s) copied verbatim for %s:',
                    count($stats['legacy_url_rows']),
                    $source
                ));

                foreach ($stats['legacy_url_rows'] as $row) {
                    $this->line(sprintf('  - imageable_id=%d storage_path=%s', $row['imageable_id'], $row['storage_path']));
                }
            }
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int,string>  $sources
     */
    private function runVerify(array $sources): int
    {
        $mismatches = 0;

        foreach ($sources as $source) {
            $stats = $this->backfiller->verify($source);
            $isOk = $stats['unbackfilled_count'] === 0;

            if (! $isOk) {
                $mismatches++;
            }

            $this->line(sprintf(
                '%s: %d unbackfilled row(s) [%s]',
                $source,
                $stats['unbackfilled_count'],
                $isOk ? 'OK' : 'MISMATCH'
            ));

            if (! $isOk) {
                foreach ($stats['samples'] as $sample) {
                    $this->line(sprintf('  - imageable_id=%d storage_path=%s', $sample['imageable_id'], $sample['storage_path']));
                }
            }
        }

        if ($mismatches > 0) {
            $this->error(sprintf('%d source(s) still have un-backfilled rows.', $mismatches));

            return self::FAILURE;
        }

        $this->info('All sources are fully backfilled.');

        return self::SUCCESS;
    }
}
