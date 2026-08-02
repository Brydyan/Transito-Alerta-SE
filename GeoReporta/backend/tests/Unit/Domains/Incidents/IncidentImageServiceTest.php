<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\IncidentImageService;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);

    $user = User::factory()->create();
    $category = IncidentCategory::create(['name' => 'Test Cat']);
    $location = Location::create(['name' => 'Test Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->service = app(IncidentImageService::class);

    Storage::fake('s3');
});

it('returns an empty collection for null or empty input, writing no rows', function (): void {
    expect($this->service->upload(null, $this->incident, true))->toHaveCount(0);
    expect($this->service->upload([], $this->incident, true))->toHaveCount(0);
    expect(Image::count())->toBe(0);
});

it('creates an images row per file and marks only the first as thumbnail when requested', function (): void {
    $files = [
        UploadedFile::fake()->image('a.jpg'),
        UploadedFile::fake()->image('b.jpg'),
    ];

    $images = $this->service->upload($files, $this->incident, true);

    expect($images)->toHaveCount(2);
    expect($images[0])->toBeInstanceOf(Image::class);
    expect($images[0]->is_thumbnail)->toBeTrue();
    expect($images[0]->sort_order)->toBe(0);
    expect($images[0]->imageable_id)->toBe($this->incident->id);
    expect($images[1]->is_thumbnail)->toBeFalse();
    expect($images[1]->sort_order)->toBe(1);
    expect(Image::count())->toBe(2);
});

it('marks no thumbnail when firstIsThumbnail is false', function (): void {
    $images = $this->service->upload(UploadedFile::fake()->image('c.jpg'), $this->incident, false);

    expect($images[0]->is_thumbnail)->toBeFalse();
});

it('offsets sort_order by the incident current image count when appending', function (): void {
    $this->service->upload(UploadedFile::fake()->image('a.jpg'), $this->incident, true);

    $images = $this->service->upload(UploadedFile::fake()->image('b.jpg'), $this->incident, false);

    expect($images[0]->sort_order)->toBe(1);
    expect(Image::count())->toBe(2);
});
