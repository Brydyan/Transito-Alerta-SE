<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class IncidentResolutionAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Incident $incident;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
        $this->seed(RolePermissionSeeder::class);

        $this->withoutMiddleware(JwtAuthenticate::class);

        foreach (Permission::all() as $permission) {
            $slug = "{$permission->resource}.{$permission->action}";
            Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
        }

        $adminRoleId = (int) DB::table('roles')->where('name', 'admin_sistema')->value('id');
        $this->user = User::factory()->create(['role_id' => $adminRoleId]);

        $location = Location::create(['name' => 'HQ', 'level' => 'city']);
        $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
        $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

        $this->incident = Incident::create([
            'title' => 'Fuga de agua',
            'incident_category_id' => $category->id,
            'user_id' => $this->user->id,
            'location_id' => $location->id,
            'organization_id' => $org->id,
            'status' => IncidentStatus::Pending,
            'priority' => 'medium',
        ]);
    }

    #[Test]
    public function it_stores_notes_in_status_history_when_updating_status(): void
    {
        $this->actingAs($this->user);

        $response = $this->putJson("/api/incidents/{$this->incident->id}", [
            'status' => IncidentStatus::Resolved->value,
            'notes' => 'Se reparó la fuga de agua en el sector.',
        ]);

        $response->assertOk();

        $history = DB::table('status_history')
            ->where('incident_id', $this->incident->id)
            ->where('new_status', IncidentStatus::Resolved->value)
            ->first();

        $this->assertNotNull($history);
        $this->assertEquals('Se reparó la fuga de agua en el sector.', $history->notes);
    }

    #[Test]
    public function it_includes_notes_in_status_history_in_incident_detail_response(): void
    {
        $this->actingAs($this->user);

        $this->putJson("/api/incidents/{$this->incident->id}", [
            'status' => IncidentStatus::Resolved->value,
            'notes' => 'Tubería reemplazada con éxito.',
        ]);

        $response = $this->getJson("/api/incidents/{$this->incident->id}");

        $response->assertOk();
        $response->assertJsonPath('data.status_history.0.notes', 'Tubería reemplazada con éxito.');
    }
}
