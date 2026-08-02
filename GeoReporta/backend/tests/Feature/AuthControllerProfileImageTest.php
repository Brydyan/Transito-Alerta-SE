<?php

declare(strict_types=1);

/**
 * Avatars are seeded via the shared `images` table
 * (image-persistence-polymorphic WU7 cutover) rather than the legacy
 * `profile_image_path` column — that column is now dead (WU8 drops it),
 * and `UserResource` sources `profile_image_path` from the
 * `avatarImage()` relation instead (D6, same bare storage-key shape).
 */

use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use App\Storage\ImageRules;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;
    Storage::fake('s3');
    $this->withoutMiddleware(JwtAuthenticate::class);
});

function seedProfileAvatar(User $user, string $path): Image
{
    Storage::disk('s3')->put($path, 'seeded avatar content');

    return Image::create([
        'imageable_type' => 'user',
        'imageable_id' => $user->id,
        'storage_path' => $path,
        'is_thumbnail' => true,
        'sort_order' => 0,
    ]);
}

it('PUT /auth/profile multipart with avatar returns 200 and stores path', function (): void {
    $user = User::factory()->create();

    $file = UploadedFile::fake()->image('avatar.jpg', 512, 512);

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
        'avatar' => $file,
    ]);

    $response->assertStatus(200);
    $response->assertJsonStructure(['id', 'email', 'first_name', 'profile_image_path']);
    $response->assertJsonPath('first_name', 'Ana');
    $path = $response->json('profile_image_path');
    expect($path)->toStartWith('users/')->toEndWith('.webp');
    Storage::disk('s3')->assertExists($path);
});

it('PUT /auth/profile JSON text-only preserves existing avatar (SCEN-7 regression)', function (): void {
    $user = User::factory()->create(['first_name' => 'Old']);
    seedProfileAvatar($user, 'users/'.$user->id.'/existing.webp');

    $response = $this->actingAs($user)->putJson('/api/auth/profile', [
        'first_name' => 'Ana',
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('first_name', 'Ana');
    // profile_image_path must NOT change (SCEN-7.5 regression)
    $response->assertJsonPath('profile_image_path', 'users/'.$user->id.'/existing.webp');
});

it('PUT /auth/profile multipart without avatar updates text only', function (): void {
    $user = User::factory()->create(['first_name' => 'Old']);

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
    ]);

    $response->assertStatus(200);
    $response->assertJsonPath('first_name', 'Ana');
});

it('PUT /auth/profile without auth returns 403 (Gate denies null user)', function (): void {
    // Note: without middleware, unauthenticated requests reach the controller/form-request
    // but Gate::authorize('update', null) returns 403. This is the correct
    // behavior when middleware auth is disabled.
    $response = $this->putJson('/api/auth/profile', [
        'first_name' => 'Ana',
    ]);

    $response->assertStatus(403);
});

it('PUT /auth/profile with oversized avatar returns 422', function (): void {
    $user = User::factory()->create();

    // Over ImageRules::MAX_SIZE_KB (5120 KB / 5 MB), the shared D10 cap
    // now enforced for avatars too (WU7 cutover).
    $file = UploadedFile::fake()->image('avatar.jpg')->size(ImageRules::MAX_SIZE_KB + 80);

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
        'avatar' => $file,
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['avatar']);
});

it('PUT /auth/profile with an unsupported MIME avatar returns 422', function (): void {
    $user = User::factory()->create();

    // bmp is not in ImageRules::MIMES (jpeg,png,webp,gif) — gif itself is
    // now accepted per the WU7 cutover to the shared D10 limits.
    $file = UploadedFile::fake()->create('avatar.bmp', 100, 'image/bmp');

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
        'avatar' => $file,
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['avatar']);
});

it('PUT /auth/profile replaces existing avatar when uploading new one', function (): void {
    $user = User::factory()->create();
    seedProfileAvatar($user, 'users/'.$user->id.'/old.webp');

    $file = UploadedFile::fake()->image('new-avatar.jpg', 512, 512);

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
        'avatar' => $file,
    ]);

    $response->assertStatus(200);
    $newPath = $response->json('profile_image_path');
    expect($newPath)->not->toBe('users/'.$user->id.'/old.webp');
    Storage::disk('s3')->assertMissing('users/'.$user->id.'/old.webp');
    Storage::disk('s3')->assertExists($newPath);
    expect(Image::where('imageable_type', 'user')->where('imageable_id', $user->id)->count())->toBe(1);
});

it('PUT /auth/profile S3 delete failure still saves new avatar and logs warning (SCEN-PIU-Replace-002)', function (): void {
    $user = User::factory()->create();
    seedProfileAvatar($user, 'users/'.$user->id.'/old-uuid.webp');

    // Mock the S3 disk so that delete() throws on the old path but put()/exists() work.
    $fakeDisk = Storage::disk('s3');
    $mockDisk = Mockery::mock($fakeDisk);
    // Specific old-path delete throws.
    $mockDisk->shouldReceive('delete')
        ->with('users/'.$user->id.'/old-uuid.webp')
        ->andThrow(new RuntimeException('S3 delete failed: file not found'));
    // All other delete calls (e.g. different path) fall through to the fake.
    $mockDisk->shouldReceive('delete')
        ->andReturnUsing(fn ($path) => $fakeDisk->delete($path));
    // put/exists/etc. delegate to the real fake disk so new upload works.
    $mockDisk->shouldReceive('put')->andReturnUsing(fn ($k, $d) => $fakeDisk->put($k, $d));
    $mockDisk->shouldReceive('exists')->andReturnUsing(fn ($k) => $fakeDisk->exists($k));
    $mockDisk->shouldReceive('assertExists')->andReturnUsing(fn ($k) => $fakeDisk->assertExists($k));
    $mockDisk->shouldReceive('assertMissing')->andReturnUsing(fn ($k) => $fakeDisk->assertMissing($k));

    Storage::shouldReceive('disk')
        ->with('s3')
        ->andReturn($mockDisk);

    Log::spy();

    $file = UploadedFile::fake()->image('new-avatar.jpg', 512, 512);

    $response = $this->actingAs($user)->put('/api/auth/profile', [
        'first_name' => 'Ana',
        'avatar' => $file,
    ]);

    $response->assertStatus(200);
    $newPath = $response->json('profile_image_path');
    expect($newPath)->not->toBe('users/'.$user->id.'/old-uuid.webp');

    // New file must be stored (warn-and-continue: upload succeeds despite delete failure).
    Storage::disk('s3')->assertExists($newPath);

    // The old row must still be gone (row deleted before the storage
    // delete failure occurs — D3 ordering) and exactly one row remains.
    expect(Image::where('imageable_type', 'user')->where('imageable_id', $user->id)->count())->toBe(1);

    // Warning must be logged with the failure context.
    Log::shouldHaveReceived('warning')
        ->withArgs(fn ($message, $context) => str_contains($message, 'Failed to delete image file from S3')
            && ($context['path'] ?? null) === 'users/'.$user->id.'/old-uuid.webp');
});
