<?php

declare(strict_types=1);

/**
 * Contract suite (image-persistence-polymorphic, WU8).
 *
 * After the WU8 `drop_legacy_image_storage` migration runs, this is the
 * end-to-end proof that create/read/delete works for images on all three
 * cutover domains (incidents, comments, user avatars) using ONLY the
 * shared `images` table — AND that the legacy columns/table are genuinely
 * gone from the schema, not just unreferenced in application code.
 *
 * Run in isolation via: php vendor/bin/pest --group=contract
 *
 * Incidents have no dedicated single-image-delete HTTP endpoint (confirmed
 * out of scope by the WU5 verify report — routes/api.php only exposes
 * DELETE /comments/{comment}/images/{image}), so the incident "delete" step
 * exercises the shared `ImageStorageService::detach()` directly — the same
 * method every domain's controller calls into for image removal.
 */

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Role id 1 = admin_sistema triggers AppServiceProvider's
    // `Gate::before` bypass (`$user->isAdmin()`), so a single admin actor
    // is authorized across incidents, comments, and users without needing
    // to seed the permissions table for this cross-domain contract suite.
    DB::table('roles')->insertOrIgnore(['id' => 1, 'name' => 'admin_sistema']);
    $adminRoleId = Role::where('name', 'admin_sistema')->first()->id;

    $this->admin = User::factory()->create(['role_id' => $adminRoleId]);
    $this->withoutMiddleware(JwtAuthenticate::class);
    Storage::fake('s3');

    $category = IncidentCategory::create(['name' => 'Contract Cat']);
    $location = Location::create(['name' => 'Contract Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Contract Org', 'location_id' => $location->id]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->admin->id,
        'location_id' => $location->id,
        'title' => 'Contract Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->comment = Comment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->admin->id,
        'message' => 'Contract comment',
    ]);
});

it('drops the legacy schema entirely — columns/table are gone at the database level, not just unreferenced in code', function (): void {
    expect(Schema::hasColumn('incidents', 'images'))->toBeFalse();
    expect(Schema::hasTable('comment_images'))->toBeFalse();
    expect(Schema::hasColumn('users', 'profile_image_path'))->toBeFalse();
})->group('contract');

it('creates, reads, and deletes an incident image end-to-end using only the images table', function (): void {
    $file = UploadedFile::fake()->image('incident.jpg', 400, 400);

    $createResponse = $this->actingAs($this->admin)
        ->patch("/api/incidents/{$this->incident->id}", ['images' => [$file]]);
    $createResponse->assertOk();

    $imageId = $createResponse->json('data.images.0.id');
    expect($imageId)->toBeInt();
    expect(Image::where('imageable_type', 'incident')->where('imageable_id', $this->incident->id)->count())->toBe(1);

    $readResponse = $this->actingAs($this->admin)->getJson("/api/incidents/{$this->incident->id}");
    $readResponse->assertOk();
    expect($readResponse->json('data.images.0.id'))->toBe($imageId);
    expect($readResponse->json('data.thumbnail_url'))->not->toBeNull();

    $image = Image::find($imageId);
    $storagePath = $image->storage_path;
    app(ImageStorageService::class)->detach($image);

    expect(Image::where('id', $imageId)->exists())->toBeFalse();
    Storage::disk('s3')->assertMissing($storagePath);

    $afterDeleteResponse = $this->actingAs($this->admin)->getJson("/api/incidents/{$this->incident->id}");
    expect($afterDeleteResponse->json('data.images'))->toBe([]);
    expect($afterDeleteResponse->json('data.thumbnail_url'))->toBeNull();
})->group('contract');

it('creates, reads, and deletes a comment image end-to-end using only the images table', function (): void {
    $file = UploadedFile::fake()->image('comment.jpg', 400, 400);

    $createResponse = $this->actingAs($this->admin)
        ->postJson("/api/comments/{$this->comment->id}/images", ['images' => [$file]]);
    $createResponse->assertStatus(201);

    $imageId = $createResponse->json('data.0.id');
    expect($imageId)->toBeInt();
    $this->assertDatabaseHas('images', [
        'id' => $imageId,
        'imageable_type' => 'comment',
        'imageable_id' => $this->comment->id,
    ]);

    // Read: the comment's own `images()` relation, sourced only from the
    // shared `images` table (CommentController::show doesn't eager-load
    // images today — reading via the model relation directly is the real
    // read pathway CommentResource uses when it IS eager-loaded).
    $reloaded = $this->comment->fresh();
    expect($reloaded->images()->count())->toBe(1);
    expect($reloaded->images()->first()->id)->toBe($imageId);

    $deleteResponse = $this->actingAs($this->admin)
        ->deleteJson("/api/comments/{$this->comment->id}/images/{$imageId}");
    $deleteResponse->assertStatus(204);

    $this->assertDatabaseMissing('images', ['id' => $imageId]);
})->group('contract');

it('creates, reads, and deletes a user avatar end-to-end using only the images table', function (): void {
    $target = User::factory()->create();
    $file = UploadedFile::fake()->image('avatar.jpg', 300, 300);

    $createResponse = $this->actingAs($this->admin)->put('/api/users/'.$target->id, [
        'first_name' => $target->first_name,
        'last_name' => $target->last_name,
        'email' => $target->email,
        'role_id' => $target->role_id,
        'organization_id' => null,
        'phone' => null,
        'avatar' => $file,
    ]);
    $createResponse->assertOk();

    $avatarPath = $createResponse->json('data.profile_image_path');
    expect($avatarPath)->toBeString();
    expect(Image::where('imageable_type', 'user')->where('imageable_id', $target->id)->count())->toBe(1);

    $readResponse = $this->actingAs($this->admin)->getJson('/api/users/'.$target->id);
    $readResponse->assertOk();
    expect($readResponse->json('data.profile_image_path'))->toBe($avatarPath);

    $deleteResponse = $this->actingAs($this->admin)->putJson('/api/users/'.$target->id, [
        'first_name' => $target->first_name,
        'last_name' => $target->last_name,
        'email' => $target->email,
        'role_id' => $target->role_id,
        'organization_id' => null,
        'phone' => null,
        '_delete_avatar' => true,
    ]);
    $deleteResponse->assertOk();

    expect($deleteResponse->json('data.profile_image_path'))->toBeNull();
    expect(Image::where('imageable_type', 'user')->where('imageable_id', $target->id)->count())->toBe(0);
})->group('contract');
