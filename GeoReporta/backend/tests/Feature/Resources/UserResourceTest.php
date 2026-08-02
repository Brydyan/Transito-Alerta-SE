<?php

declare(strict_types=1);

namespace Tests\Feature\Resources;

use App\Domains\Users\Http\Resources\UserResource;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserResourceTest extends TestCase
{
    use RefreshDatabase;

    public function test_to_array_includes_timestamps(): void
    {
        $user = User::factory()->create();

        $resource = new UserResource($user);
        $array = $resource->toArray(request());

        $this->assertArrayHasKey('created_at', $array);
        $this->assertArrayHasKey('updated_at', $array);
        $this->assertNotNull($array['created_at']);
        $this->assertNotNull($array['updated_at']);
    }

    /**
     * WU7 cutover: `profile_image_path` is now sourced from the
     * `avatarImage()` relation (the shared `images` table), not the
     * legacy column — same bare storage-key shape (D6).
     */
    public function test_profile_image_path_is_null_when_no_avatar_image_exists(): void
    {
        $user = User::factory()->create();

        $resource = new UserResource($user);
        $array = $resource->toArray(request());

        $this->assertArrayHasKey('profile_image_path', $array);
        $this->assertNull($array['profile_image_path']);
    }

    public function test_profile_image_path_reflects_the_avatar_image_relation(): void
    {
        $user = User::factory()->create();
        Image::create([
            'imageable_type' => 'user',
            'imageable_id' => $user->id,
            'storage_path' => 'users/'.$user->id.'/current.webp',
            'is_thumbnail' => true,
            'sort_order' => 0,
        ]);

        $resource = new UserResource($user);
        $array = $resource->toArray(request());

        $this->assertSame('users/'.$user->id.'/current.webp', $array['profile_image_path']);
    }
}
