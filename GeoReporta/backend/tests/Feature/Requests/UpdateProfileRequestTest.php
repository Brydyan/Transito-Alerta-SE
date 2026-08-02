<?php

declare(strict_types=1);

use App\Domains\Auth\Local\Http\Requests\UpdateProfileRequest;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\ImageRules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);
});

it('JSON request with text-only fields validates successfully', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;
    $request->replace(['first_name' => 'Ana', 'last_name' => 'García', 'phone' => '099123456']);

    $validator = validator($request->all(), $request->rules());

    expect($validator->passes())->toBeTrue();
});

it('JSON request does NOT trigger avatar file validation', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;
    // Only text fields present (no avatar key)
    $request->replace([
        'first_name' => 'Ana',
        'last_name' => 'García',
        'phone' => null,
        'password' => null,
    ]);

    $validator = validator($request->all(), $request->rules());

    expect($validator->passes())->toBeTrue();
    expect($validator->errors()->has('avatar'))->toBeFalse();
});

it('multipart request with valid avatar passes file validation', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;

    $file = UploadedFile::fake()->image('avatar.jpg', 512, 512);

    $request->merge([
        'first_name' => 'Ana',
        'last_name' => 'García',
    ]);
    $request->files->set('avatar', $file);

    $validator = validator($request->all(), $request->rules());

    expect($validator->passes())->toBeTrue();
});

it('avatar file over the ImageRules size cap is rejected', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;

    // 5200 KB > ImageRules::MAX_SIZE_KB (5120 KB / 5 MB), same pattern used
    // by the other image-upload endpoints (incidents, comments).
    $file = UploadedFile::fake()->image('avatar.jpg')->size(5200);

    $request->merge(['first_name' => 'Ana']);
    $request->files->set('avatar', $file);

    $validator = validator($request->all(), $request->rules());

    expect($validator->fails())->toBeTrue();
    expect($validator->errors()->has('avatar'))->toBeTrue();
});

it('avatar file at exactly the ImageRules size cap is accepted', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;

    $file = UploadedFile::fake()->image('avatar.jpg')->size(ImageRules::MAX_SIZE_KB);

    $request->merge(['first_name' => 'Ana']);
    $request->files->set('avatar', $file);

    $validator = validator($request->all(), $request->rules());

    expect($validator->passes())->toBeTrue();
});

it('avatar file with a wrong MIME is rejected', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;

    // bmp is not in ImageRules::MIMES (jpeg,png,webp,gif) — gif is now
    // accepted per the WU7 cutover to the shared D10 limits.
    $file = UploadedFile::fake()->create('avatar.bmp', 100, 'image/bmp');

    $request->merge(['first_name' => 'Ana']);
    $request->files->set('avatar', $file);

    $validator = validator($request->all(), $request->rules());

    expect($validator->fails())->toBeTrue();
    expect($validator->errors()->has('avatar'))->toBeTrue();
});

it('avatar file as gif is now accepted per the shared ImageRules D10 limits', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;

    $file = UploadedFile::fake()->create('avatar.gif', 100, 'image/gif');

    $request->merge(['first_name' => 'Ana']);
    $request->files->set('avatar', $file);

    $validator = validator($request->all(), $request->rules());

    expect($validator->passes())->toBeTrue();
});

it('authorize returns true when user is authenticated', function (): void {
    $user = User::factory()->create();
    $request = new UpdateProfileRequest;
    $request->setUserResolver(fn () => $user);

    expect($request->authorize())->toBeTrue();
});
