<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Organizations\Models\Organization;
use Illuminate\Database\Seeder;

class IncidentCategorySeeder extends Seeder
{
    /**
     * Category tree applied globally, then assigned to all organizations.
     * Structure: [ parent_name => [child_name, ...] ]
     */
    private const CATEGORY_TREE = [
        'Infraestructura Vial' => [
            'Baches y Hundimientos',
            'Semáforos Dañados',
            'Señalización Vial',
            'Alumbrado Público',
        ],
        'Servicios Básicos' => [
            'Agua Potable',
            'Alcantarillado',
            'Recolección de Residuos',
            'Red Eléctrica',
        ],
        'Seguridad Ciudadana' => [
            'Robos y Hurtos',
            'Vandalismo',
            'Accidentes de Tránsito',
        ],
        'Medio Ambiente' => [
            'Contaminación Ambiental',
            'Tala de Árboles',
            'Basureros Clandestinos',
        ],
        'Obras e Infraestructura' => [
            'Construcciones Ilegales',
            'Obras Abandonadas',
            'Veredas y Aceras Deterioradas',
        ],
    ];

    public function run(): void
    {
        $organizations = Organization::all();

        if ($organizations->isEmpty()) {
            $this->command?->warn('No organizations found — run OrganizationSeeder first.');

            return;
        }

        $this->command?->info('Creating global categories...');

        foreach (self::CATEGORY_TREE as $parentName => $children) {
            $parent = IncidentCategory::firstOrCreate(
                ['name' => $parentName, 'parent_id' => null],
            );

            foreach ($children as $childName) {
                IncidentCategory::firstOrCreate(
                    ['name' => $childName, 'parent_id' => $parent->id],
                );
            }
        }

        $this->command?->info('Assigning categories to all organizations...');

        $firstCategoryId = IncidentCategory::first()?->id;
        if ($firstCategoryId === null) {
            return;
        }

        foreach ($organizations as $organization) {
            if ($organization->incident_category_id === null) {
                $organization->update(['incident_category_id' => $firstCategoryId]);
            }
        }
    }
}
