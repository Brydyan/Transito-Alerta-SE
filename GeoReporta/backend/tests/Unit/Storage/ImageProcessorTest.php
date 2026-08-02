<?php

declare(strict_types=1);

use App\Storage\ImageProcessor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

uses(TestCase::class);

it('processes an uploaded image and returns S3 path', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/large-image.jpg';
    $file = new UploadedFile($filePath, 'large-image.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result = $service->processUploadedImage($file, 42);

    expect($result)->toStartWith('comments/42/')
        ->toEndWith('.webp');
});

it('stores processed image at correct S3 path', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file = new UploadedFile($filePath, 'test-image.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result = $service->processUploadedImage($file, 5);

    Storage::disk('s3')->assertExists($result);
});

it('generates unique path for each processed image', function (): void {
    Storage::fake('s3');

    $filePath = __DIR__.'/../../fixtures/test-image.jpg';
    $file1 = new UploadedFile($filePath, 'test1.jpg', 'image/jpeg', null, true);
    $file2 = new UploadedFile($filePath, 'test2.jpg', 'image/jpeg', null, true);

    $service = new ImageProcessor;
    $result1 = $service->processUploadedImage($file1, 1);
    $result2 = $service->processUploadedImage($file2, 1);

    expect($result1)->not->toBe($result2);
});

it('throws RuntimeException when processing fails', function (): void {
    Storage::fake('s3');

    $service = new ImageProcessor;

    $fakeFile = UploadedFile::fake()->create('broken.pdf', 100);

    $service->processUploadedImage($fakeFile, 1);
})->throws(RuntimeException::class)->skip(extension_loaded('gd') === false, 'GD extension not available');
