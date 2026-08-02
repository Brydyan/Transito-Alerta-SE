<?php

declare(strict_types=1);

/**
 * Guard test for the `drop_legacy_image_storage` migration (image-
 * persistence-polymorphic, WU8).
 *
 * RefreshDatabase migrates straight to head, where the legacy schema is
 * already dropped and — on a fresh, empty test DB — trivially guard-clean
 * (0 source rows == 0 target rows for every source). To exercise the real
 * "an operator forgot to backfill before this deploy" scenario, these tests
 * manually roll back ONLY the drop migration (resurrecting the empty legacy
 * schema via its own `down()`), seed un-backfilled legacy rows directly,
 * then re-run `php artisan migrate` against that dirty state.
 */

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

/**
 * Seeds the legacy `incidents.images` JSON column directly via the query
 * builder. `Incident::$fillable`/`casts()` no longer declare `images`
 * (post-WU8 property-collision fix), so `$incident->update(['images' =>
 * ...])` mass assignment would silently discard the key.
 *
 * @param  array<int,array<string,mixed>>  $images
 */
if (! function_exists('seedLegacyIncidentImages')) {
    function seedLegacyIncidentImages(Incident $incident, array $images): void
    {
        DB::table('incidents')->where('id', $incident->id)->update([
            'images' => json_encode($images),
        ]);
    }
}

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);

    $this->user = User::factory()->create();
    $category = IncidentCategory::create(['name' => 'Test Cat']);
    $location = Location::create(['name' => 'Test Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    // Undo just the drop migration, resurrecting the (empty) legacy schema
    // so this test can seed genuinely un-backfilled legacy data into it.
    rollbackThroughMigration('2026_07_25_000002_drop_legacy_image_storage');
});

it('refuses to drop legacy image storage and leaves the schema intact when a source has un-backfilled rows', function (): void {
    seedLegacyIncidentImages($this->incident, [
        ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => true],
    ]);

    // The guard throws from inside the migration's up(); Artisan::call()
    // lets this propagate as a real PHP exception rather than swallowing
    // it into a non-zero exit code.
    $thrownMessage = null;

    try {
        Artisan::call('migrate');
    } catch (RuntimeException $e) {
        $thrownMessage = $e->getMessage();
    }

    expect($thrownMessage)->toContain('Refusing to drop legacy image storage');
    expect($thrownMessage)->toContain('incidents');

    // Nothing was dropped — the guard must fire before any Schema::drop* call.
    expect(Schema::hasColumn('incidents', 'images'))->toBeTrue();
    expect(Schema::hasTable('comment_images'))->toBeTrue();
    expect(Schema::hasColumn('users', 'profile_image_path'))->toBeTrue();
});

it('refuses to drop when only the users source has un-backfilled rows (guard checks every source, not just incidents)', function (): void {
    // forceFill(): profile_image_path is dead and no longer $fillable
    // (WU8 removed it from User::$fillable) — bypass mass assignment
    // protection deliberately to seed legacy data directly.
    $this->user->forceFill(['profile_image_path' => 'users/'.$this->user->id.'/avatar.webp'])->save();

    $thrownMessage = null;

    try {
        Artisan::call('migrate');
    } catch (RuntimeException $e) {
        $thrownMessage = $e->getMessage();
    }

    expect($thrownMessage)->toContain('Refusing to drop legacy image storage');
    expect($thrownMessage)->toContain('users');
    expect($thrownMessage)->not->toContain('incidents (');

    expect(Schema::hasColumn('users', 'profile_image_path'))->toBeTrue();
});

it('proceeds with the drop once images:backfill has made every source clean', function (): void {
    seedLegacyIncidentImages($this->incident, [
        ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => true],
    ]);

    Artisan::call('images:backfill');
    $verifyExit = Artisan::call('images:backfill', ['--verify' => true]);
    expect($verifyExit)->toBe(0);

    Artisan::call('migrate');

    expect(Schema::hasColumn('incidents', 'images'))->toBeFalse();
    expect(Schema::hasTable('comment_images'))->toBeFalse();
    expect(Schema::hasColumn('users', 'profile_image_path'))->toBeFalse();
});

it('proceeds with the drop when a post-cutover images row has no legacy counterpart at all (false-positive regression)', function (): void {
    // This incident has NO legacy `images` JSON — nothing to backfill.
    // Simulate a real post-cutover upload: a brand new `images` row is
    // created directly (as WU5's cutover code does), never touching the
    // legacy JSON column. The old aggregate `source_count === target_count`
    // guard incorrectly treated this extra row as an unexplained mismatch
    // (source=0, images=1) and refused to drop, even though there is
    // nothing left to backfill. The correct invariant is per-row: every
    // legacy row (there are none here) has a matching `images` row.
    $this->incident->images()->create([
        'storage_path' => 'incidents/'.$this->incident->id.'/post-cutover.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
    ]);

    Artisan::call('migrate');

    expect(Schema::hasColumn('incidents', 'images'))->toBeFalse();
    expect(Schema::hasTable('comment_images'))->toBeFalse();
    expect(Schema::hasColumn('users', 'profile_image_path'))->toBeFalse();
});
