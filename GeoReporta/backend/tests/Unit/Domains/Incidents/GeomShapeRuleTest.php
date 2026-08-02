<?php

declare(strict_types=1);

use App\Domains\Incidents\Http\Rules\GeomShapeRule;
use MatanYadaev\EloquentSpatial\Objects\Point;

function geomShapeRule(): GeomShapeRule
{
    return new GeomShapeRule;
}

it('accepts null', function (): void {
    expect(geomShapeRule()->passes('geom', null))->toBeTrue();
});

it('accepts a valid GeoJSON Point array', function (): void {
    expect(geomShapeRule()->passes('geom', [
        'type' => 'Point',
        'coordinates' => [-80.7, -0.9],
    ]))->toBeTrue();
});

it('rejects an array without type', function (): void {
    expect(geomShapeRule()->passes('geom', [
        'coordinates' => [-80.7, -0.9],
    ]))->toBeFalse();
});

it('rejects an array without coordinates', function (): void {
    expect(geomShapeRule()->passes('geom', [
        'type' => 'Point',
    ]))->toBeFalse();
});

it('accepts a valid JSON string', function (): void {
    expect(geomShapeRule()->passes('geom', json_encode([
        'type' => 'Point',
        'coordinates' => [-80.7, -0.9],
    ], JSON_THROW_ON_ERROR)))->toBeTrue();
});

it('rejects a malformed JSON string', function (): void {
    expect(geomShapeRule()->passes('geom', '{"type":"Point"'))->toBeFalse();
});

it('accepts an existing Eloquent Spatial Point', function (): void {
    expect(geomShapeRule()->passes('geom', new Point(-0.9, -80.7, 4326)))->toBeTrue();
});

it('rejects a scalar string', function (): void {
    expect(geomShapeRule()->passes('geom', 'hello'))->toBeFalse();
});

it('rejects an integer', function (): void {
    expect(geomShapeRule()->passes('geom', 42))->toBeFalse();
});
