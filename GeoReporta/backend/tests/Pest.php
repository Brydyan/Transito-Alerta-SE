<?php

require __DIR__.'/../vendor/autoload.php';

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Rolls back migrations through (and including) the named migration,
 * anchored by name instead of a positional `--step` count.
 *
 * `Artisan::call('migrate:rollback', ['--step' => N])` counts migrations
 * from HEAD, not batches — every time a new migration lands after the
 * intended target, N silently drifts and the wrong set gets rolled back
 * (backend-tests-postgres-migration, GitHub issue #197: this exact drift
 * already happened once, the three call sites hardcoded `--step 3` where
 * the comments still said "step 2"). Deriving the step count from the
 * `migrations` table itself keeps the anchor correct regardless of how
 * many migrations get added later.
 *
 * @throws RuntimeException when the anchor migration is not found —
 *                          e.g. it was renamed.
 */
function rollbackThroughMigration(string $migration): void
{
    $anchorId = DB::table('migrations')
        ->where('migration', $migration)
        ->value('id');

    if ($anchorId === null) {
        throw new RuntimeException("Rollback anchor migration [{$migration}] not found — was it renamed?");
    }

    $steps = DB::table('migrations')
        ->where('id', '>=', $anchorId)
        ->count();

    Artisan::call('migrate:rollback', ['--step' => $steps]);
}
