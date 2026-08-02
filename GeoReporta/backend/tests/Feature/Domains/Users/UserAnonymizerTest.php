<?php

declare(strict_types=1);

namespace Tests\Feature\Domains\Users;

use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Domains\Users\Services\UserAnonymizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAnonymizerTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_an_empty_array_when_the_subject_is_null(): void
    {
        $citizen = User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'usuario'])->id,
        ]);

        $payload = (new UserAnonymizer)->anonymize(null, $citizen);

        $this->assertSame([], $payload);
    }

    public function test_returns_the_real_payload_for_operators_viewing_any_subject(): void
    {
        $operator = User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'admin_organizacion'])->id,
        ]);
        $subject = User::factory()->create([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'email' => 'ada@example.com',
        ]);

        $payload = (new UserAnonymizer)->anonymize($subject, $operator);

        $this->assertFalse($payload['is_anonymous']);
        $this->assertSame('Ada', $payload['first_name']);
        $this->assertSame('Lovelace', $payload['last_name']);
        $this->assertSame('ada@example.com', $payload['email']);
    }

    public function test_anonymizes_the_subject_for_a_regular_viewer_citizen(): void
    {
        $citizen = User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'usuario'])->id,
        ]);
        $subject = User::factory()->create([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'email' => 'ada@example.com',
        ]);

        $payload = (new UserAnonymizer)->anonymize($subject, $citizen);

        $this->assertSame($subject->id, $payload['id']);
        $this->assertTrue($payload['is_anonymous']);
        $this->assertNull($payload['first_name']);
        $this->assertNull($payload['last_name']);
        $this->assertNull($payload['email']);
        $this->assertNull($payload['phone']);
        $this->assertNull($payload['avatar']);
        $this->assertNull($payload['profile_image_path']);
    }

    public function test_citizen_viewer_always_sees_their_own_data_even_as_usuario(): void
    {
        $alice = User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'usuario'])->id,
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
        ]);

        $payload = (new UserAnonymizer)->anonymize($alice, $alice);

        $this->assertFalse($payload['is_anonymous']);
        $this->assertSame('Ada', $payload['first_name']);
        $this->assertSame('Lovelace', $payload['last_name']);
    }

    public function test_anonymizes_when_the_viewer_is_null_no_auth_or_write_time_serializer(): void
    {
        $subject = User::factory()->create([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
        ]);

        $payload = (new UserAnonymizer)->anonymize($subject, null);

        $this->assertTrue($payload['is_anonymous']);
        $this->assertNull($payload['first_name']);
        $this->assertSame($subject->id, $payload['id']);
    }

    public function test_admin_sistema_sees_real_data_even_when_subject_is_in_another_org(): void
    {
        $adminSistema = User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'admin_sistema'])->id,
        ]);
        $subject = User::factory()->create([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
        ]);

        $payload = (new UserAnonymizer)->anonymize($subject, $adminSistema);

        $this->assertFalse($payload['is_anonymous']);
        $this->assertSame('Ada', $payload['first_name']);
    }
}
