<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    // Fetch admin_sistema role ID
    $adminRoleId = Role::where('name', 'admin_sistema')->first()->id;

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }
    foreach (
        Permission::whereIn('resource', ['comments', 'incidents'])
            ->whereIn('action', ['view', 'create', 'update', 'delete'])
            ->get() as $perm
    ) {
        DB::table('role_permission')->insertOrIgnore([
            'role_id' => $adminRoleId,
            'permission_id' => $perm->permission_id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    $this->withoutMiddleware(JwtAuthenticate::class);
    Storage::fake('s3');

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
});

it('uploads an image and returns 201 with image data', function (): void {
    $file = UploadedFile::fake()->image('test.jpg', 800, 600);

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertStatus(201);
    $response->assertJsonStructure(['data' => ['*' => ['id', 'comment_id', 'url', 'caption', 'sort_order', 'created_at']]]);
    $response->assertJsonCount(1, 'data');
    $this->assertDatabaseHas('images', [
        'imageable_type' => 'comment',
        'imageable_id' => $this->comment->id,
    ]);
    // The legacy `comment_images` table is dropped entirely as of WU8
    // (image-persistence-polymorphic) — its absence is now a schema-level
    // fact asserted in tests/Feature/Contract/ImagePersistenceContractTest.php,
    // not something a per-row assertDatabaseMissing can check anymore (the
    // table itself no longer exists to query).
    expect($response->json('data.0.comment_id'))->toBe($this->comment->id);
    Storage::disk('s3')->assertExists($response->json('data.0.url'));
});

it('uploads multiple images in one request', function (): void {
    $file1 = UploadedFile::fake()->image('test1.jpg', 800, 600);
    $file2 = UploadedFile::fake()->image('test2.png', 1024, 768);

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file1, $file2],
        ]);

    $response->assertStatus(201);
    $response->assertJsonCount(2, 'data');
    $this->assertDatabaseCount('images', 2);
});

it('keeps the webp resize+encode processing when routed through the shared ImageStorageService', function (): void {
    $file = UploadedFile::fake()->image('test.jpg', 800, 600);

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertStatus(201);
    expect($response->json('data.0.url'))->toEndWith('.webp');
    expect($response->json('data.0.url'))->toStartWith('comments/'.$this->comment->id.'/');
});

it('rejects non-image files', function (): void {
    $file = UploadedFile::fake()->create('document.pdf', 512, 'application/pdf');

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('rejects image over 10MB', function (): void {
    $file = UploadedFile::fake()->image('large.jpg')->size(11000);

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('rejects image just over the D10 5MB limit (validation parity)', function (): void {
    $file = UploadedFile::fake()->image('just-over.jpg')->size(5200); // 5.2 MB > ImageRules::MAX_SIZE_KB

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images.0']);
});

it('rejects empty images array', function (): void {
    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [],
        ]);

    $response->assertStatus(422);
});

it('rejects more than the D10 max file count (validation parity)', function (): void {
    $files = array_map(
        fn (int $i) => UploadedFile::fake()->image("photo{$i}.jpg", 200, 200),
        range(1, 11),
    );

    $response = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => $files,
        ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['images']);
});

it('denies image upload to non-owner', function (): void {
    $stranger = User::factory()->create(['role_id' => 5]);
    $file = UploadedFile::fake()->image('test.jpg', 800, 600);

    $response = $this->actingAs($stranger)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $response->assertForbidden();
});

it('deletes an image and returns 204', function (): void {
    $image = Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => $this->comment->id,
        'storage_path' => 'comments/1/test.webp',
        'caption' => null,
        'sort_order' => 0,
    ]);
    Storage::disk('s3')->put($image->storage_path, 'fake image content');

    $response = $this->actingAs($this->user)
        ->deleteJson("/api/comments/{$this->comment->id}/images/{$image->id}");

    $response->assertStatus(204);
    $this->assertDatabaseMissing('images', ['id' => $image->id]);
    Storage::disk('s3')->assertMissing($image->storage_path);
});

it('denies image delete to non-owner', function (): void {
    $image = Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => $this->comment->id,
        'storage_path' => 'comments/1/test.webp',
    ]);
    Storage::disk('s3')->put($image->storage_path, 'fake image content');
    $stranger = User::factory()->create(['role_id' => 5]);

    $response = $this->actingAs($stranger)
        ->deleteJson("/api/comments/{$this->comment->id}/images/{$image->id}");

    $response->assertForbidden();
    $this->assertDatabaseHas('images', ['id' => $image->id]);
});

it('returns 404 when deleting an image that belongs to a different comment', function (): void {
    $otherComment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user->id,
        'message' => 'Other comment',
    ]);
    $image = Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => $otherComment->id,
        'storage_path' => 'comments/2/test.webp',
    ]);
    Storage::disk('s3')->put($image->storage_path, 'fake image content');

    $response = $this->actingAs($this->user)
        ->deleteJson("/api/comments/{$this->comment->id}/images/{$image->id}");

    $response->assertStatus(404);
    $this->assertDatabaseHas('images', ['id' => $image->id]);
});

it('uploads then deletes a comment image on the same configured disk (disk-key regression)', function (): void {
    // Regression for the disk-key mismatch: upload used to write via
    // FILESYSTEM_STORAGE_DISK while delete read the unrelated
    // FILESYSTEM_DISK var, orphaning the object whenever the two env
    // vars diverged. Both paths must now share one config source, so
    // pointing that source at a non-default disk must move BOTH the
    // upload and the delete together.
    config(['filesystems.image_disk' => 'public']);
    Storage::fake('public');

    $file = UploadedFile::fake()->image('regression.jpg', 400, 400);

    $uploadResponse = $this->actingAs($this->user)
        ->postJson("/api/comments/{$this->comment->id}/images", [
            'images' => [$file],
        ]);

    $uploadResponse->assertStatus(201);
    $imageId = $uploadResponse->json('data.0.id');
    $imageUrl = $uploadResponse->json('data.0.url');
    Storage::disk('public')->assertExists($imageUrl);

    $deleteResponse = $this->actingAs($this->user)
        ->deleteJson("/api/comments/{$this->comment->id}/images/{$imageId}");

    $deleteResponse->assertStatus(204);
    Storage::disk('public')->assertMissing($imageUrl);
});
