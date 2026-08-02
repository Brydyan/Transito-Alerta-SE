<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use Illuminate\Database\Seeder;

class OrganizationSeeder extends Seeder
{
    /**
     * Organizaciones principales por ubicación.
     * Cada una puede tener sucursales (hijos).
     * [location_code => [nombre_principal, [[nombre_sucursal, location_code], ...]]]
     */
    private const ORGANIZATIONS = [
        'EC-17-01' => [
            'name' => 'GAD Municipal del Cantón Quito',
            'branches' => [
                ['GAD Quito — Zona Centro',  'EC-17-01'],
                ['GAD Quito — Zona Norte',   'EC-17-01'],
                ['GAD Quito — Zona Sur',     'EC-17-01'],
            ],
        ],
        'EC-09-01' => [
            'name' => 'GAD Municipal del Cantón Guayaquil',
            'branches' => [
                ['GAD Guayaquil — Centro',   'EC-09-01'],
                ['GAD Guayaquil — Norte',    'EC-09-01'],
            ],
        ],
        'EC-01-01' => [
            'name' => 'GAD Municipal del Cantón Cuenca',
            'branches' => [
                ['GAD Cuenca — Centro',      'EC-01-01'],
            ],
        ],
        'EC-18-01' => [
            'name' => 'GAD Municipal del Cantón Ambato',
            'branches' => [],
        ],
        'EC-11-01' => [
            'name' => 'GAD Municipal del Cantón Loja',
            'branches' => [],
        ],
    ];

    public function run(): void
    {
        foreach (self::ORGANIZATIONS as $locationCode => $config) {
            $location = Location::where('code', $locationCode)->first();

            if ($location === null) {
                $this->command?->warn("Location [{$locationCode}] not found — skipping [{$config['name']}].");

                continue;
            }

            $parent = Organization::updateOrCreate(
                ['name' => $config['name']],
                ['location_id' => $location->id, 'parent_id' => null],
            );

            $this->command?->info("Organization [{$config['name']}] seeded.");

            foreach ($config['branches'] as [$branchName, $branchLocationCode]) {
                $branchLocation = Location::where('code', $branchLocationCode)->first();
                if ($branchLocation === null) {
                    $this->command?->warn("Location [{$branchLocationCode}] not found — skipping branch [{$branchName}].");

                    continue;
                }

                Organization::updateOrCreate(
                    ['name' => $branchName],
                    ['location_id' => $branchLocation->id, 'parent_id' => $parent->id],
                );

                $this->command?->info("  Branch [{$branchName}] seeded.");
            }
        }
    }
}
