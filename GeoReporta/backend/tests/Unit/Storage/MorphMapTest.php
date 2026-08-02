<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Database\ClassMorphViolationException;
use Illuminate\Database\Eloquent\Relations\Relation;
use Tests\TestCase;

uses(TestCase::class);

it('resolves the short alias to the FQCN for each mapped model', function (): void {
    expect(Relation::getMorphedModel('incident'))->toBe(Incident::class);
    expect(Relation::getMorphedModel('comment'))->toBe(Comment::class);
    expect(Relation::getMorphedModel('user'))->toBe(User::class);
});

it('resolves the FQCN back to the short alias for each mapped model', function (): void {
    expect((new Incident)->getMorphClass())->toBe('incident');
    expect((new Comment)->getMorphClass())->toBe('comment');
    expect((new User)->getMorphClass())->toBe('user');
});

it('requires an explicit morph map entry (enforceMorphMap)', function (): void {
    expect(Relation::requiresMorphMap())->toBeTrue();
});

it('throws loudly when an unmapped model is used for a polymorphic relation', function (): void {
    $role = new Role(['name' => 'unmapped-test-role']);

    expect(fn () => $role->getMorphClass())->toThrow(ClassMorphViolationException::class);
});
