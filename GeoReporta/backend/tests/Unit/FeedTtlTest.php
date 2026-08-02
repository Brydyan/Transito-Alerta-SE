<?php

declare(strict_types=1);

use App\Support\Cache\FeedTtl;

it('falls back to default when env is null', function (): void {
    expect(FeedTtl::resolve(null))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default when env is an empty string', function (): void {
    expect(FeedTtl::resolve(''))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default when env is whitespace only', function (): void {
    expect(FeedTtl::resolve('   '))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve("\t\n"))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default when env is non-numeric', function (): void {
    expect(FeedTtl::resolve('abc'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('7d'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('1.5.0'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('true'))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default when env is zero', function (): void {
    expect(FeedTtl::resolve('0'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('0.0'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('-0'))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default when env is negative', function (): void {
    expect(FeedTtl::resolve('-5'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('-1'))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve('-604800'))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('falls back to default for boolean values', function (): void {
    // putenv('FOO=true') produce booleanos que no son numéricos.
    expect(FeedTtl::resolve(true))->toBe(FeedTtl::DEFAULT_SECONDS);
    expect(FeedTtl::resolve(false))->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('accepts the documented positive default', function (): void {
    expect(FeedTtl::resolve((string) FeedTtl::DEFAULT_SECONDS))
        ->toBe(FeedTtl::DEFAULT_SECONDS);
});

it('accepts a positive override', function (): void {
    expect(FeedTtl::resolve('86400'))->toBe(86400);
    expect(FeedTtl::resolve('3600'))->toBe(3600);
    expect(FeedTtl::resolve('1'))->toBe(1);
});

it('truncates fractional positive values to int seconds', function (): void {
    // "86400.7" es numérico y positivo: trunca a 86400.
    expect(FeedTtl::resolve('86400.7'))->toBe(86400);
    expect(FeedTtl::resolve('3.5'))->toBe(3);
});

it('never returns a non-positive value', function (): void {
    $cases = [null, '', '   ', 'abc', '0', '-5', '0.0', '-0', true, false, '7d'];

    foreach ($cases as $case) {
        expect(FeedTtl::resolve($case))->toBeGreaterThan(0);
    }
});

it('exposes a positive default constant', function (): void {
    // Guard: si alguien cambia el default a algo <=0, el guard de
    // "never returns non-positive" deja de ser informativo.
    expect(FeedTtl::DEFAULT_SECONDS)->toBeGreaterThan(0);
    expect(FeedTtl::DEFAULT_SECONDS)->toBe(604800);
});
