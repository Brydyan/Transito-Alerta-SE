<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);

    // RefreshDatabase migrates straight to head, where WU8's
    // drop_legacy_image_storage migration has already removed the legacy
    // schema this command reads from. Resurrect it (empty) the same way
    // the WU8 guard test does, by rolling back to that migration.
    rollbackThroughMigration('2026_07_25_000002_drop_legacy_image_storage');

    $this->user = User::factory()->create();
    // forceFill(): profile_image_path is dead and no longer $fillable
    // (WU8 removed it from User::$fillable) — bypass mass assignment
    // protection deliberately to seed legacy data directly.
    $this->user->forceFill(['profile_image_path' => 'users/1/avatar.webp'])->save();
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

    // `Incident::$fillable`/`casts()` no longer declare `images` (post-WU8
    // property-collision fix), so the legacy JSON column must be seeded
    // directly via the query builder, bypassing Eloquent mass assignment.
    DB::table('incidents')->where('id', $this->incident->id)->update([
        'images' => json_encode([
            ['path' => 'incidents/1/a.webp', 'original_name' => 'a.jpg', 'mime_type' => 'image/webp', 'size' => 111, 'is_thumbnail' => true],
        ]),
    ]);

    $this->comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Test comment',
    ]);

    DB::table('comment_images')->insert([
        'comment_id' => $this->comment->id,
        'url' => 'comments/'.$this->comment->id.'/x.webp',
        'caption' => null,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
});

it('backfills all three sources when run with no flags', function (): void {
    $exitCode = Artisan::call('images:backfill');

    expect($exitCode)->toBe(0);
    expect(Image::where('imageable_type', 'incident')->count())->toBe(1);
    expect(Image::where('imageable_type', 'comment')->count())->toBe(1);
    expect(Image::where('imageable_type', 'user')->count())->toBe(1);
});

it('only backfills the requested source with --source', function (): void {
    Artisan::call('images:backfill', ['--source' => 'incidents']);

    expect(Image::where('imageable_type', 'incident')->count())->toBe(1);
    expect(Image::where('imageable_type', 'comment')->count())->toBe(0);
    expect(Image::where('imageable_type', 'user')->count())->toBe(0);
});

it('does not persist anything with --dry-run, but reports what would be created', function (): void {
    $exitCode = Artisan::call('images:backfill', ['--dry-run' => true]);
    $output = Artisan::output();

    expect($exitCode)->toBe(0);
    expect(Image::count())->toBe(0);
    expect($output)->toContain('dry-run');
    expect($output)->toContain('1 image(s) created');
});

it('rejects an unknown --source without touching the database', function (): void {
    $exitCode = Artisan::call('images:backfill', ['--source' => 'bogus']);

    expect($exitCode)->toBe(1);
    expect(Image::count())->toBe(0);
});

it('reports legacy absolute-URL comment rows in its output without crashing', function (): void {
    $legacyUrl = 'https://old-cdn.example.com/legacy/photo.jpg';
    $secondComment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Second comment',
    ]);
    DB::table('comment_images')->insert([
        'comment_id' => $secondComment->id,
        'url' => $legacyUrl,
        'caption' => null,
        'sort_order' => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $exitCode = Artisan::call('images:backfill', ['--source' => 'comments']);
    $output = Artisan::output();

    expect($exitCode)->toBe(0);
    expect($output)->toContain('legacy absolute-URL row(s) copied verbatim');
    expect($output)->toContain($legacyUrl);

    $row = Image::where('imageable_type', 'comment')->where('imageable_id', $secondComment->id)->first();
    expect($row->storage_path)->toBe($legacyUrl);
});

it('creates no duplicate rows when run twice', function (): void {
    Artisan::call('images:backfill');
    Artisan::call('images:backfill');

    expect(Image::where('imageable_type', 'incident')->count())->toBe(1);
    expect(Image::where('imageable_type', 'comment')->count())->toBe(1);
    expect(Image::where('imageable_type', 'user')->count())->toBe(1);
});

it('reports OK for --verify when a source has already been fully backfilled', function (): void {
    Artisan::call('images:backfill', ['--source' => 'incidents']);

    $exitCode = Artisan::call('images:backfill', ['--source' => 'incidents', '--verify' => true]);
    $output = Artisan::output();

    expect($exitCode)->toBe(0);
    expect($output)->toContain('[OK]');
    expect(Image::count())->toBe(1);
});

it('reports a MISMATCH for --verify when a source has not been backfilled yet, without writing anything', function (): void {
    $exitCode = Artisan::call('images:backfill', ['--source' => 'comments', '--verify' => true]);
    $output = Artisan::output();

    expect($exitCode)->toBe(1);
    expect($output)->toContain('[MISMATCH]');
    expect(Image::count())->toBe(0);
});
