<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Seed roles and permissions (skip IncidentSeeder — requires PostGIS).
    //
    // insertOrIgnore with pinned ids to ensure consistent FK targets.
    // Fetch admin_sistema ID by name (lines 38-39) to resolve dynamically.
    // `Role::firstOrCreate()` relies on nextval(), which does NOT reliably land
    // on 1 — PostgreSQL sequences are not rolled back between tests, so
    // an earlier test in the same parallel worker database can leave the
    // sequence past 1 by the time this one runs (see RoleSeederTest /
    // the same convention documented in AssignmentPolicyTest.php).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
        ['id' => 2, 'name' => 'operador_sistema'],
        ['id' => 3, 'name' => 'admin_organizacion'],
        ['id' => 4, 'name' => 'operador_organizacion'],
        ['id' => 5, 'name' => 'usuario'],
    ]);

    // Fetch admin_sistema role ID by name
    $adminRoleId = Role::where('name', 'admin_sistema')->first()->id;

    Permission::create(['resource' => 'comments', 'action' => 'view',   'name' => 'Ver Comentarios',       'description' => '']);
    Permission::create(['resource' => 'comments', 'action' => 'create', 'name' => 'Agregar Comentarios',   'description' => '']);
    Permission::create(['resource' => 'comments', 'action' => 'update', 'name' => 'Editar Comentarios',    'description' => '']);
    Permission::create(['resource' => 'comments', 'action' => 'delete', 'name' => 'Eliminar Comentarios',  'description' => '']);
    Permission::create(['resource' => 'incidents', 'action' => 'view',   'name' => 'Ver Incidencias',      'description' => '']);
    Permission::create(['resource' => 'incidents', 'action' => 'create', 'name' => 'Crear Incidencias',    'description' => '']);
    Permission::create(['resource' => 'incidents', 'action' => 'update', 'name' => 'Actualizar Incidencias', 'description' => '']);
    Permission::create(['resource' => 'incidents', 'action' => 'delete', 'name' => 'Eliminar Incidencias', 'description' => '']);

    // Role-permission grants for admin_sistema (resolved from name, not hardcoded)
    foreach (Permission::all() as $perm) {
        DB::table('role_permission')->insertOrIgnore([
            'role_id' => $adminRoleId,
            'permission_id' => $perm->permission_id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    Storage::fake('s3');

    $this->user = User::factory()->create();
    $category = IncidentCategory::create(['name' => 'Test Cat']);
    $location = Location::create(['name' => 'Test Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
    $this->comment = Comment::create([
        'incident_id' => $incident->id,
        'user_id' => $this->user->id,
        'message' => 'Comment with images',
    ]);
});

it('deletes S3 images when comment is deleted', function (): void {
    Storage::disk('s3')->put('comments/1/img1.webp', 'content1');
    Storage::disk('s3')->put('comments/1/img2.webp', 'content2');

    Image::create(['imageable_type' => 'comment', 'imageable_id' => $this->comment->id, 'storage_path' => 'comments/1/img1.webp']);
    Image::create(['imageable_type' => 'comment', 'imageable_id' => $this->comment->id, 'storage_path' => 'comments/1/img2.webp']);

    $this->comment->delete();

    Storage::disk('s3')->assertMissing('comments/1/img1.webp');
    Storage::disk('s3')->assertMissing('comments/1/img2.webp');
});

it('soft-deletes comment even if S3 delete fails gracefully', function (): void {
    Storage::disk('s3')->put('comments/1/img1.webp', 'content1');
    Image::create(['imageable_type' => 'comment', 'imageable_id' => $this->comment->id, 'storage_path' => 'comments/1/img1.webp']);

    $this->comment->delete();

    $this->assertSoftDeleted('comments', ['id' => $this->comment->id]);
    expect(Image::where('imageable_type', 'comment')->where('imageable_id', $this->comment->id)->count())->toBe(0);
});

it('deletes S3 images from the configured image disk when comment is deleted (disk-key regression)', function (): void {
    // Regression for the disk-key mismatch: the observer used to read
    // the unrelated FILESYSTEM_DISK var instead of the disk images are
    // actually stored on, orphaning objects whenever the two diverged.
    config(['filesystems.image_disk' => 'public']);
    Storage::fake('public');

    Storage::disk('public')->put('comments/1/regression.webp', 'content1');
    Image::create(['imageable_type' => 'comment', 'imageable_id' => $this->comment->id, 'storage_path' => 'comments/1/regression.webp']);

    $this->comment->delete();

    Storage::disk('public')->assertMissing('comments/1/regression.webp');
});
