<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\ImageBackfiller;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);

    // RefreshDatabase migrates straight to head, where WU8's
    // drop_legacy_image_storage migration has already removed the legacy
    // schema this class reads from. ImageBackfiller/BackfillImages remain
    // functionally required for the pre-drop recovery path (guard aborts
    // -> operator backfills -> retries migrate), so this test resurrects
    // the empty legacy schema the same way the WU8 guard test does, by
    // rolling back to that migration before seeding legacy rows.
    rollbackThroughMigration('2026_07_25_000002_drop_legacy_image_storage');

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

    $this->comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Test comment',
    ]);

    $this->backfiller = new ImageBackfiller;
});

/**
 * Seeds the legacy `incidents.images` JSON column directly via the query
 * builder. `Incident::$fillable`/`casts()` no longer declare `images`
 * (post-WU8 property-collision fix), so `$incident->update(['images' =>
 * ...])` mass assignment would silently discard the key — this bypasses
 * Eloquent entirely, exactly mirroring how `ImageBackfiller` itself now
 * reads this column.
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

it('backfills incident images preserving array order and deriving is_thumbnail from index, not the stored flag', function (): void {
    // The JSON flag deliberately disagrees with order (index 0 has
    // is_thumbnail=false in the stored JSON) to prove D5: the backfiller
    // must derive is_thumbnail from array position, matching what
    // IncidentResource actually displays ($images[0]), not the flag.
    seedLegacyIncidentImages($this->incident, [
        ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => false],
        ['path' => 'incidents/1/b.webp', 'original_name' => 'b.jpg', 'mime_type' => 'image/webp', 'size' => 222, 'is_thumbnail' => true],
    ]);

    $stats = $this->backfiller->backfillIncidents();

    expect($stats['source_count'])->toBe(2);
    expect($stats['created_count'])->toBe(2);

    $rows = Image::where('imageable_type', 'incident')
        ->where('imageable_id', $this->incident->id)
        ->orderBy('sort_order')
        ->get();

    expect($rows)->toHaveLength(2);
    expect($rows[0]->storage_path)->toBe('incidents/1/a.webp');
    expect($rows[0]->original_name)->toBe('a.jpg');
    expect($rows[0]->size)->toBe(111);
    expect($rows[0]->sort_order)->toBe(0);
    expect($rows[0]->is_thumbnail)->toBeTrue();

    expect($rows[1]->storage_path)->toBe('incidents/1/b.webp');
    expect($rows[1]->sort_order)->toBe(1);
    expect($rows[1]->is_thumbnail)->toBeFalse();
});

it('is idempotent for incidents: running backfillIncidents twice creates no duplicate rows', function (): void {
    seedLegacyIncidentImages($this->incident, [
        ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => true],
    ]);

    $first = $this->backfiller->backfillIncidents();
    $second = $this->backfiller->backfillIncidents();

    expect($first['created_count'])->toBe(1);
    expect($second['created_count'])->toBe(0);
    expect($second['source_count'])->toBe(1);
    expect(Image::where('imageable_type', 'incident')->count())->toBe(1);
});

it('backfills a normal bare-key comment_images row, preserving caption and sort_order', function (): void {
    DB::table('comment_images')->insert([
        'comment_id' => $this->comment->id,
        'url' => 'comments/'.$this->comment->id.'/x.webp',
        'caption' => 'a nice photo',
        'sort_order' => 3,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $stats = $this->backfiller->backfillComments();

    expect($stats['source_count'])->toBe(1);
    expect($stats['created_count'])->toBe(1);
    expect($stats['legacy_url_rows'])->toBe([]);

    $row = Image::where('imageable_type', 'comment')->where('imageable_id', $this->comment->id)->first();

    expect($row)->not->toBeNull();
    expect($row->storage_path)->toBe('comments/'.$this->comment->id.'/x.webp');
    expect($row->caption)->toBe('a nice photo');
    expect($row->sort_order)->toBe(3);
});

it('copies a legacy absolute-URL comment_images row verbatim into storage_path and reports it, never guessing a bare key', function (): void {
    $legacyUrl = 'https://old-cdn.example.com/legacy/comment-photo.jpg';

    DB::table('comment_images')->insert([
        'comment_id' => $this->comment->id,
        'url' => $legacyUrl,
        'caption' => null,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $stats = $this->backfiller->backfillComments();

    expect($stats['created_count'])->toBe(1);
    expect($stats['legacy_url_rows'])->toBe([
        ['imageable_id' => $this->comment->id, 'storage_path' => $legacyUrl],
    ]);

    $row = Image::where('imageable_type', 'comment')->where('imageable_id', $this->comment->id)->first();

    // Verbatim copy — never mangled, never reverse-derived into a bare key.
    expect($row->storage_path)->toBe($legacyUrl);
});

it('is idempotent for comments: running backfillComments twice creates no duplicate rows', function (): void {
    DB::table('comment_images')->insert([
        'comment_id' => $this->comment->id,
        'url' => 'comments/'.$this->comment->id.'/x.webp',
        'caption' => null,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $first = $this->backfiller->backfillComments();
    $second = $this->backfiller->backfillComments();

    expect($first['created_count'])->toBe(1);
    expect($second['created_count'])->toBe(0);
    expect(Image::where('imageable_type', 'comment')->count())->toBe(1);
});

it('creates exactly one avatar row with is_thumbnail=true per user', function (): void {
    // forceFill(): profile_image_path is dead and no longer $fillable
    // (WU8 removed it from User::$fillable) — this bypasses mass
    // assignment protection deliberately, to seed legacy data directly.
    $this->user->forceFill(['profile_image_path' => 'users/'.$this->user->id.'/avatar.webp'])->save();

    $stats = $this->backfiller->backfillUsers();

    expect($stats['source_count'])->toBe(1);
    expect($stats['created_count'])->toBe(1);

    $rows = Image::where('imageable_type', 'user')->where('imageable_id', $this->user->id)->get();

    expect($rows)->toHaveLength(1);
    expect($rows[0]->storage_path)->toBe('users/'.$this->user->id.'/avatar.webp');
    expect($rows[0]->is_thumbnail)->toBeTrue();
});

it('is idempotent for users: running backfillUsers twice creates no duplicate rows', function (): void {
    $this->user->forceFill(['profile_image_path' => 'users/'.$this->user->id.'/avatar.webp'])->save();

    $first = $this->backfiller->backfillUsers();
    $second = $this->backfiller->backfillUsers();

    expect($first['created_count'])->toBe(1);
    expect($second['created_count'])->toBe(0);
    expect(Image::where('imageable_type', 'user')->count())->toBe(1);
});

it('skips users with no profile_image_path', function (): void {
    // $this->user has no profile_image_path set (null by default).
    $stats = $this->backfiller->backfillUsers();

    expect($stats['source_count'])->toBe(0);
    expect($stats['created_count'])->toBe(0);
    expect(Image::where('imageable_type', 'user')->count())->toBe(0);
});

it('verify() reports un-backfilled legacy rows without writing anything, then reports clean after backfill', function (): void {
    seedLegacyIncidentImages($this->incident, [
        ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => true],
        ['path' => 'incidents/1/b.webp', 'original_name' => 'b.jpg', 'mime_type' => 'image/webp', 'size' => 222, 'is_thumbnail' => false],
    ]);

    $before = $this->backfiller->verify('incidents');

    expect($before['unbackfilled_count'])->toBe(2);
    expect($before['samples'])->toBe([
        ['imageable_id' => $this->incident->id, 'storage_path' => 'incidents/1/a.webp'],
        ['imageable_id' => $this->incident->id, 'storage_path' => 'incidents/1/b.webp'],
    ]);
    expect(Image::count())->toBe(0);

    $this->backfiller->backfillIncidents();

    $after = $this->backfiller->verify('incidents');

    expect($after)->toBe(['unbackfilled_count' => 0, 'samples' => []]);
});

it('verify() does not count a post-cutover images row with no legacy counterpart as unbackfilled (false-positive regression)', function (): void {
    // This incident has NO legacy `images` JSON at all — nothing to
    // backfill. Simulate a real post-cutover upload: a brand new `images`
    // row created directly, exactly as WU5's cutover code does, never
    // touching the legacy JSON column. Extra `images` rows like this are
    // expected once the app has served real traffic post-cutover and must
    // NOT be reported as unbackfilled.
    $this->incident->images()->create([
        'storage_path' => 'incidents/'.$this->incident->id.'/post-cutover.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
    ]);

    $stats = $this->backfiller->verify('incidents');

    expect($stats)->toBe(['unbackfilled_count' => 0, 'samples' => []]);
});
