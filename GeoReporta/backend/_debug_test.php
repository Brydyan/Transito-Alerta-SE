<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
config(['database.default' => 'sqlite']);
config(['database.connections.sqlite.database' => ':memory:']);
DB::purge('sqlite');
DB::reconnect('sqlite');
DB::connection('sqlite')->getPdo()->exec('PRAGMA foreign_keys = ON');
Artisan::call('migrate:fresh', ['--force' => true, '--database' => 'sqlite']);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Contracts\Console\Kernel;

try {
    Role::create(['id' => 1, 'name' => 'Admin']);
    Role::create(['id' => 3, 'name' => 'publicador']);
    echo "Roles OK\n";

    $prov = Location::create(['name' => 'Province', 'level' => 'province']);
    $city = Location::create(['name' => 'City', 'level' => 'city', 'parent_id' => $prov->id]);
    Location::create(['name' => 'Other', 'level' => 'city']);
    echo "Locations OK (prov=$prov->id, city=$city->id)\n";

    $cat1 = IncidentCategory::create(['name' => 'Accidents']);
    IncidentCategory::create(['name' => 'Fires']);
    echo "Categories OK (cat1=$cat1->id)\n";

    $org = Organization::create([
        'name' => 'Org',
        'location_id' => $prov->id,
        'incident_category_id' => $cat1->id,
        'max_active_claims' => 5,
    ]);
    echo "Org OK (id=$org->id)\n";

    try {
        $user = User::factory()->create([
            'role_id' => 3,
            'organization_id' => $org->id,
        ]);
        echo "User OK (id=$user->id, org_id=$user->organization_id)\n";
    } catch (Exception $e) {
        echo 'USER FAILED: '.$e->getMessage()."\n";
    }

} catch (Exception $e) {
    echo 'FAILED: '.$e->getMessage()."\n";
}
