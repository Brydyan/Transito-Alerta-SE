<?php

declare(strict_types=1);

use App\Domains\Users\Models\User;
use Illuminate\Support\Facades\Artisan;

/**
 * The codegen command backs the auto-generated
 * `frontend/app/utils/avatar.constants.js` file.
 *
 * These tests pin the contract: idempotency and `--check` block on
 * drift. They intentionally do NOT pin the byte content of the file
 * (we trust the command's own assertions) so future constant additions
 * don't require this suite to update.
 */
it('produces the generated file when run with no flags', function (): void {
    Artisan::call('avatar:generate-frontend-constants');

    // `__DIR__` is backend/tests/Feature/Console; the generated file lives in
    // sibling frontend/ four levels up (one above `backend/`).
    $path = dirname(__DIR__, 4).'/frontend/app/utils/avatar.constants.js';
    expect(file_exists($path))->toBeTrue();

    $contents = file_get_contents($path);
    // AUTO-GENERATED banner is the contract.
    expect($contents)
        ->toContain('AUTO-GENERATED')
        ->toContain('AVATAR_MAX_KB = '.User::AVATAR_MAX_KB)
        ->toContain('ACCEPTED_MIME_TYPES = Object.freeze')
        ->toContain('"image/jpeg"')
        ->toContain('"image/png"')
        ->toContain('"image/webp"');
});

it('exits 0 in --check mode when the file is in sync', function (): void {
    Artisan::call('avatar:generate-frontend-constants'); // ensure fresh
    $exitCode = Artisan::call('avatar:generate-frontend-constants', ['--check' => true]);
    expect($exitCode)->toBe(0);
});

it('exits non-zero in --check mode on drift', function (): void {
    $path = dirname(__DIR__, 4).'/frontend/app/utils/avatar.constants.js';
    $original = file_get_contents($path);

    file_put_contents($path, $original."\n// tampered\n");
    try {
        $exitCode = Artisan::call('avatar:generate-frontend-constants', ['--check' => true]);
        expect($exitCode)->toBe(1);
    } finally {
        // Restore by re-generating, so the on-disk file stays in sync.
        Artisan::call('avatar:generate-frontend-constants');
    }
});

it('writes the same content on repeated runs (idempotent)', function (): void {
    $path = dirname(__DIR__, 4).'/frontend/app/utils/avatar.constants.js';

    Artisan::call('avatar:generate-frontend-constants');
    $first = file_get_contents($path);

    Artisan::call('avatar:generate-frontend-constants');
    $second = file_get_contents($path);

    expect($second)->toBe($first);
});
