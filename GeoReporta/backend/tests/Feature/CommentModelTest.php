<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);
});

it('has replies relationship', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $parent = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Parent comment',
    ]);

    $reply = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Reply comment',
        'parent_id' => $parent->id,
    ]);

    expect($parent->replies)->toHaveCount(1);
    expect($parent->replies->first()->id)->toBe($reply->id);
});

it('has parent relationship', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $parent = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Parent comment',
    ]);

    $reply = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Reply comment',
        'parent_id' => $parent->id,
    ]);

    expect($reply->parent)->toBeInstanceOf(Comment::class);
    expect($reply->parent->id)->toBe($parent->id);
});

it('has images relationship', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $comment = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Comment with image',
    ]);

    Image::create([
        'imageable_type' => 'comment',
        'imageable_id' => $comment->id,
        'storage_path' => 'comments/1/uuid.webp',
        'caption' => null,
        'sort_order' => 0,
    ]);

    // Refresh + load because RedisCommentSync accessed images on 'created'
    $comment->refresh()->load('images');
    expect($comment->images)->toHaveCount(1);
});

it('depth accessor returns 0 for top-level comment', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $comment = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Top level',
    ]);

    expect($comment->depth)->toBe(0);
});

it('depth accessor returns 1 for first-level reply', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $parent = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Parent',
    ]);

    $reply = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Reply',
        'parent_id' => $parent->id,
    ]);

    expect($reply->depth)->toBe(1);
});

it('depth accessor returns 2 for second-level reply', function (): void {
    $category = IncidentCategory::create(['name' => 'Cat']);
    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $user = User::factory()->create();

    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $user->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $parent = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Parent',
    ]);

    $reply1 = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Reply 1',
        'parent_id' => $parent->id,
    ]);

    $reply2 = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $user->id,
        'message' => 'Reply 2',
        'parent_id' => $reply1->id,
    ]);

    expect($reply2->depth)->toBe(2);
});
