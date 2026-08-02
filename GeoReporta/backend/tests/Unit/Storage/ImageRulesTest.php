<?php

declare(strict_types=1);

use App\Storage\ImageRules;

it('exposes the D10 validation-parity constants', function (): void {
    expect(ImageRules::MAX_FILES)->toBe(10);
    expect(ImageRules::MAX_SIZE_KB)->toBe(5120); // 5 MB
    expect(ImageRules::MIMES)->toBe(['jpeg', 'png', 'webp', 'gif']);
});

it('builds gallery per-file rules with mimes and max size', function (): void {
    $rules = ImageRules::galleryFileRules();

    expect($rules)->toContain('image');
    expect($rules)->toContain('mimes:jpeg,png,webp,gif');
    expect($rules)->toContain('max:5120');
});

it('builds gallery array-level rules with the max file count', function (): void {
    $rules = ImageRules::galleryArrayRules();

    expect($rules)->toContain('array');
    expect($rules)->toContain('max:10');
});

it('builds avatar per-file rules with the same mimes and max size as gallery', function (): void {
    $rules = ImageRules::avatarFileRules();

    expect($rules)->toContain('image');
    expect($rules)->toContain('mimes:jpeg,png,webp,gif');
    expect($rules)->toContain('max:5120');
});
