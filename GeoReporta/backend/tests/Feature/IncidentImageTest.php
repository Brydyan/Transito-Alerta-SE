<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'Admin']);

    $this->user = User::factory()->create();
    $this->category = IncidentCategory::create(['name' => 'Test Category']);
    $this->location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $this->location->id,
    ]);

    Storage::fake('s3');
});

// ─── Upload through incident creation ───────────────────────────────

it('uploads images when creating an incident, writing rows to the images table', function (): void {
    $file = UploadedFile::fake()->image('incidencia.jpg', 800, 600);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Test with image',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => [$file],
        ]);

    $response->assertStatus(201);
    $response->assertJsonStructure([
        'data' => [
            'id', 'title', 'thumbnail_url', 'images',
        ],
    ]);

    $incidentId = $response->json('data.id');

    // La metadata de imágenes ahora vive en la tabla polimórfica `images`,
    // no en la columna JSON legacy (que queda sin uso tras este cutover).
    expect(Image::where('imageable_type', 'incident')->where('imageable_id', $incidentId)->count())->toBe(1);

    $image = Image::where('imageable_type', 'incident')->where('imageable_id', $incidentId)->first();
    expect($image->original_name)->toBe('incidencia.jpg');
    expect($image->is_thumbnail)->toBeTrue();
    expect($image->sort_order)->toBe(0);

    // El id expuesto en la API es el entero real de la tabla `images`,
    // no el id sintético `{incidentId}-{md5(path)}` que existía antes.
    expect($response->json('data.images.0.id'))->toBe($image->id);
    expect($response->json('data.images.0.id'))->toBeInt();
});

it('uploads images when updating an incident, appending to the existing set', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->org->id,
        'user_id' => $this->user->id,
        'location_id' => $this->location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $file = UploadedFile::fake()->image('update.jpg');

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->patch("/api/incidents/{$incident->id}", [
            'title' => 'Updated',
            'images' => [$file],
        ]);

    $response->assertOk();
    $response->assertJsonPath('data.title', 'Updated');
    $response->assertJsonStructure(['data' => ['images']]);

    expect(Image::where('imageable_type', 'incident')->where('imageable_id', $incident->id)->count())->toBe(1);
    $image = Image::where('imageable_type', 'incident')->where('imageable_id', $incident->id)->first();
    expect($image->original_name)->toBe('update.jpg');
    expect($image->is_thumbnail)->toBeTrue();
    expect($image->sort_order)->toBe(0);

    // Second update — appends, and the new row continues sort_order rather
    // than restarting/overwriting the existing one.
    $file2 = UploadedFile::fake()->image('second.jpg');
    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->patch("/api/incidents/{$incident->id}", [
            'images' => [$file2],
        ]);

    expect(Image::where('imageable_type', 'incident')->where('imageable_id', $incident->id)->count())->toBe(2);
    $appended = Image::where('imageable_type', 'incident')
        ->where('imageable_id', $incident->id)
        ->where('original_name', 'second.jpg')
        ->first();
    expect($appended->sort_order)->toBe(1);
    expect($appended->is_thumbnail)->toBeFalse();
});

// ─── Validation ──────────────────────────────────────────────────────

it('validates image mime type', function (): void {
    $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf');

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Test',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('rejects images over 10MB', function (): void {
    $file = UploadedFile::fake()->image('huge.jpg')->size(11000); // 11MB

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Test',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('rejects an image just over the D10 5MB limit (validation parity)', function (): void {
    $file = UploadedFile::fake()->image('just-over.jpg')->size(5200); // 5.2MB > ImageRules::MAX_SIZE_KB

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Test',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('accepts a gif image (D10 union of accepted MIME types)', function (): void {
    $file = UploadedFile::fake()->image('animated.gif', 200, 200);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Test with gif',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => [$file],
        ]);

    $response->assertStatus(201);
});

it('rejects more than the D10 max file count (validation parity)', function (): void {
    $files = array_map(
        fn (int $i) => UploadedFile::fake()->image("photo{$i}.jpg", 100, 100),
        range(1, 11),
    );

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->post('/api/incidents', [
            'title' => 'Too many images',
            'incident_category_id' => $this->category->id,
            'location_id' => $this->location->id,
            'priority' => Incident::PRIORITY_MEDIUM,
            'images' => $files,
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images']);
});

// ─── Thumbnail behavior ──────────────────────────────────────────────

it('first uploaded image becomes thumbnail', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->org->id,
        'user_id' => $this->user->id,
        'location_id' => $this->location->id,
        'title' => 'Thumbnail test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $file1 = UploadedFile::fake()->image('first.jpg');
    $file2 = UploadedFile::fake()->image('second.jpg');

    // First batch — two images, only first should be thumbnail
    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->patch("/api/incidents/{$incident->id}", [
            'images' => [$file1, $file2],
        ]);

    $images = Image::where('imageable_type', 'incident')->where('imageable_id', $incident->id)->orderBy('sort_order')->get();
    expect($images)->toHaveCount(2);
    expect($images[0]->original_name)->toBe('first.jpg');
    expect($images[0]->is_thumbnail)->toBeTrue();
    expect($images[1]->original_name)->toBe('second.jpg');
    expect($images[1]->is_thumbnail)->toBeFalse();

    // Third image — no thumbnail because it already has one
    $file3 = UploadedFile::fake()->image('third.jpg');
    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->patch("/api/incidents/{$incident->id}", [
            'images' => [$file3],
        ]);

    $images = Image::where('imageable_type', 'incident')->where('imageable_id', $incident->id)->orderBy('sort_order')->get();
    expect($images)->toHaveCount(3);
    expect($images[2]->original_name)->toBe('third.jpg');
    expect($images[2]->is_thumbnail)->toBeFalse();
});

it('selects the thumbnail via the is_thumbnail flag, not array/sort_order position', function (): void {
    // Deliberately construct a case where the flagged thumbnail is NOT at
    // sort_order 0 — proves the genuine bug fix: IncidentResource must read
    // the real is_thumbnail flag on the row, not `$images[0]` by position.
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->org->id,
        'user_id' => $this->user->id,
        'location_id' => $this->location->id,
        'title' => 'Flag vs position test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $incident->images()->create([
        'imageable_type' => 'incident',
        'storage_path' => 'incidents/1/first.jpg',
        'original_name' => 'first.jpg',
        'mime_type' => 'image/jpeg',
        'size' => 100,
        'is_thumbnail' => false,
        'sort_order' => 0,
    ]);
    $realThumbnail = $incident->images()->create([
        'imageable_type' => 'incident',
        'storage_path' => 'incidents/1/second.jpg',
        'original_name' => 'second.jpg',
        'mime_type' => 'image/jpeg',
        'size' => 200,
        'is_thumbnail' => true,
        'sort_order' => 1,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/incidents/{$incident->id}");

    $response->assertOk();
    $thumbnailUrl = $response->json('data.thumbnail_url');
    expect($thumbnailUrl)->toContain(str_replace('/', '--', $realThumbnail->storage_path));

    $images = collect($response->json('data.images'));
    $flaggedInResponse = $images->firstWhere('id', $realThumbnail->id);
    expect($flaggedInResponse['is_thumbnail'])->toBeTrue();
    expect($images->firstWhere('is_thumbnail', true)['id'])->toBe($realThumbnail->id);
});

// ─── Images in show response ─────────────────────────────────────────

it('includes images and thumbnail when showing an incident', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->org->id,
        'user_id' => $this->user->id,
        'location_id' => $this->location->id,
        'title' => 'Detail view test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $incident->images()->create([
        'imageable_type' => 'incident',
        'storage_path' => 'images/1/a.jpg',
        'original_name' => 'a.jpg',
        'mime_type' => 'image/jpeg',
        'size' => 512,
        'is_thumbnail' => true,
        'sort_order' => 0,
    ]);
    $incident->images()->create([
        'imageable_type' => 'incident',
        'storage_path' => 'images/1/b.jpg',
        'original_name' => 'b.jpg',
        'mime_type' => 'image/jpeg',
        'size' => 1024,
        'is_thumbnail' => false,
        'sort_order' => 1,
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->user)
        ->getJson("/api/incidents/{$incident->id}");

    $response->assertOk();
    $response->assertJsonStructure([
        'data' => [
            'thumbnail_url',
            'images' => [
                '*' => ['id', 'url', 'original_name', 'is_thumbnail'],
            ],
        ],
    ]);
    $response->assertJsonCount(2, 'data.images');
    expect($response->json('data.images.0.id'))->toBeInt();
});
