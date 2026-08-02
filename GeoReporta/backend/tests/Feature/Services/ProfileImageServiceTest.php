<?php

declare(strict_types=1);

use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Domains\Users\Services\ProfileImageService;
use App\Storage\ImageStorageService;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);
    Storage::fake('s3');
    $this->service = app(ProfileImageService::class);
});

it('replaceAvatar creates exactly one images row with is_thumbnail=true', function (): void {
    $user = User::factory()->create();

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $image = $this->service->replaceAvatar($user, $file);

    expect($image)->toBeInstanceOf(Image::class);
    expect($image->is_thumbnail)->toBeTrue();
    expect(Image::where('imageable_type', 'user')->where('imageable_id', $user->id)->count())->toBe(1);
    expect($image->storage_path)->toStartWith('users/'.$user->id.'/')->toEndWith('.webp');
    Storage::disk('s3')->assertExists($image->storage_path);
});

it('replaceAvatar twice leaves exactly one row and object (old one gone)', function (): void {
    $user = User::factory()->create();

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $firstFile = new UploadedFile($filePath, 'first.jpg', 'image/jpeg', null, true);
    $secondFile = new UploadedFile($filePath, 'second.jpg', 'image/jpeg', null, true);

    $first = $this->service->replaceAvatar($user, $firstFile);
    $second = $this->service->replaceAvatar($user, $secondFile);

    expect(Image::where('imageable_type', 'user')->where('imageable_id', $user->id)->count())->toBe(1);
    expect(Image::find($first->id))->toBeNull();
    expect(Image::find($second->id))->not->toBeNull();
    expect($second->is_thumbnail)->toBeTrue();
    Storage::disk('s3')->assertMissing($first->storage_path);
    Storage::disk('s3')->assertExists($second->storage_path);
});

it('removeAvatar deletes both the images row and the storage object', function (): void {
    $user = User::factory()->create();
    $image = app(ImageStorageService::class)->attach(
        $user,
        new UploadedFile(__DIR__.'/../../fixtures/test-image.jpg', 'existing.jpg', 'image/jpeg', null, true),
        profile: 'avatar',
        isThumbnail: true,
    );

    $this->service->removeAvatar($user);

    expect(Image::find($image->id))->toBeNull();
    Storage::disk('s3')->assertMissing($image->storage_path);
});

it('removeAvatar with no existing avatar is a no-op', function (): void {
    $user = User::factory()->create();

    $this->service->removeAvatar($user);

    expect(Image::where('imageable_type', 'user')->where('imageable_id', $user->id)->count())->toBe(0);
});
