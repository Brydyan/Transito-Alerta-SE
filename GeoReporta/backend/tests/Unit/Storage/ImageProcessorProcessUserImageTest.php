<?php

declare(strict_types=1);

use App\Storage\ImageProcessor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

uses(TestCase::class);

it('processes a user image and returns users/{userId}/{uuid}.webp path', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result = $service->processUserImage($file, 42);

    expect($result)->toStartWith('users/42/')
        ->toEndWith('.webp');
});

it('stores processed user image at correct S3 path', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result = $service->processUserImage($file, 5);

    Storage::disk('s3')->assertExists($result);
});

it('generates unique paths for each processed image', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file1 = new UploadedFile($filePath, 'test1.jpg', 'image/jpeg', null, true);
    $file2 = new UploadedFile($filePath, 'test2.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result1 = $service->processUserImage($file1, 1);
    $result2 = $service->processUserImage($file2, 1);

    expect($result1)->not->toBe($result2);
});

it('stores WebP magic bytes at the correct path', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result = $service->processUserImage($file, 7);

    $stored = Storage::disk('s3')->get($result);
    // WebP magic bytes: RIFF....WEBP
    expect(substr($stored, 0, 4))->toBe('RIFF');
    expect(substr($stored, 8, 4))->toBe('WEBP');
});

it('throws RuntimeException when processing fails', function (): void {
    Storage::fake('s3');

    $service = new ImageProcessor;
    $fakeFile = UploadedFile::fake()->create('broken.pdf', 100);

    $service->processUserImage($fakeFile, 1);
})->throws(RuntimeException::class)->skip(extension_loaded('gd') === false, 'GD extension not available');
