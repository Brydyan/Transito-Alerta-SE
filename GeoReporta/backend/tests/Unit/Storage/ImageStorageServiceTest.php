<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

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

    $this->service = app(ImageStorageService::class);
});

it('attach() uploads the object and creates the images row atomically', function (): void {
    Storage::fake('s3');

    $image = $this->service->attach(
        $this->incident,
        UploadedFile::fake()->image('photo.jpg'),
        sortOrder: 0,
        isThumbnail: true,
    );

    expect($image->exists)->toBeTrue();
    expect($image->imageable_type)->toBe('incident');
    expect($image->imageable_id)->toBe($this->incident->id);
    expect($image->is_thumbnail)->toBeTrue();
    expect(Image::count())->toBe(1);
    Storage::disk('s3')->assertExists($image->storage_path);
});

it('attachMany() creates ordered rows and marks only the first as thumbnail', function (): void {
    Storage::fake('s3');

    $files = [
        UploadedFile::fake()->image('a.jpg'),
        UploadedFile::fake()->image('b.jpg'),
        UploadedFile::fake()->image('c.jpg'),
    ];

    $images = $this->service->attachMany($this->incident, $files, firstIsThumbnail: true);

    expect($images)->toHaveCount(3);
    expect($images[0]->sort_order)->toBe(0);
    expect($images[0]->is_thumbnail)->toBeTrue();
    expect($images[1]->sort_order)->toBe(1);
    expect($images[1]->is_thumbnail)->toBeFalse();
    expect($images[2]->sort_order)->toBe(2);
    expect($images[2]->is_thumbnail)->toBeFalse();

    foreach ($images as $stored) {
        Storage::disk('s3')->assertExists($stored->storage_path);
    }
});

it('rolls back the transaction and deletes the just-uploaded object when the DB insert fails (D3)', function (): void {
    Storage::fake('s3');

    $first = $this->service->attach(
        $this->incident,
        UploadedFile::fake()->image('a.jpg'),
        isThumbnail: true,
    );

    expect(Storage::disk('s3')->allFiles())->toHaveCount(1);

    // Second thumbnail for the same owner violates the D4 partial unique
    // index — a genuine DB-level failure, not mocked. If ImageStorageService
    // did NOT delete the just-uploaded object on failure, allFiles() below
    // would show 2 entries (the orphan for 'b.jpg' left behind).
    $threw = false;

    try {
        $this->service->attach(
            $this->incident,
            UploadedFile::fake()->image('b.jpg'),
            isThumbnail: true,
        );
    } catch (QueryException) {
        $threw = true;
    }

    expect($threw)->toBeTrue();
    expect(Image::count())->toBe(1);
    expect(Storage::disk('s3')->allFiles())->toHaveCount(1);
    Storage::disk('s3')->assertExists($first->storage_path);
});

it('detach() removes both the images row and the storage object', function (): void {
    Storage::fake('s3');

    $image = $this->service->attach($this->incident, UploadedFile::fake()->image('a.jpg'));
    Storage::disk('s3')->assertExists($image->storage_path);

    $this->service->detach($image);

    expect(Image::find($image->id))->toBeNull();
    Storage::disk('s3')->assertMissing($image->storage_path);
});

it('detach() only removes the targeted image, leaving sibling images and objects intact', function (): void {
    Storage::fake('s3');

    $a = $this->service->attach($this->incident, UploadedFile::fake()->image('a.jpg'), sortOrder: 0);
    $b = $this->service->attach($this->incident, UploadedFile::fake()->image('b.jpg'), sortOrder: 1);

    $this->service->detach($a);

    expect(Image::find($a->id))->toBeNull();
    expect(Image::find($b->id))->not->toBeNull();
    Storage::disk('s3')->assertMissing($a->storage_path);
    Storage::disk('s3')->assertExists($b->storage_path);
});

it('replaceSingle() leaves exactly one row and object for the owner', function (): void {
    Storage::fake('s3');

    $old = $this->service->attach(
        $this->user,
        UploadedFile::fake()->image('old.jpg'),
        profile: 'avatar',
        isThumbnail: true,
    );

    $new = $this->service->replaceSingle($this->user, UploadedFile::fake()->image('new.jpg'));

    expect(Image::where('imageable_type', 'user')->where('imageable_id', $this->user->id)->count())->toBe(1);
    expect(Image::find($new->id)->is_thumbnail)->toBeTrue();
    Storage::disk('s3')->assertMissing($old->storage_path);
    Storage::disk('s3')->assertExists($new->storage_path);
});

it('uses the avatar profile (ImageProcessor webp resize) when a "avatar" profile is requested', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $image = $this->service->attach($this->user, $file, profile: 'avatar', isThumbnail: true);

    expect($image->storage_path)->toStartWith('users/'.$this->user->id.'/');
    expect($image->storage_path)->toEndWith('.webp');
    Storage::disk('s3')->assertExists($image->storage_path);
});
