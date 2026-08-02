<?php

namespace Database\Seeders;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentPriority;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use Illuminate\Database\Seeder;

class IncidentTestDataSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Obtener organización y usuario
        $org = Organization::first() ?? Organization::factory()->create();
        $user = User::where('organization_id', $org->id)->first()
            ?? User::factory()->create(['organization_id' => $org->id]);

        // Obtener ubicaciones
        $locations = Location::where('level', 'city')->limit(5)->get();
        if ($locations->isEmpty()) {
            $locations = Location::factory(5)->create(['level' => 'city']);
        }

        // Obtener categorías hoja (sin subcategorías) disponibles
        $categories = IncidentCategory::whereDoesntHave('children')->limit(5)->get();
        if ($categories->isEmpty()) {
            // Si no hay categorías hoja, crear jerarquía
            $parentCategories = [
                'Infraestructura' => ['Calles', 'Aceras', 'Alumbrado'],
                'Servicios' => ['Agua', 'Alcantarillado', 'Recolección'],
                'Seguridad' => ['Vialidad', 'Robo', 'Vandalismo'],
                'Transporte' => ['Señalización', 'Semáforos', 'Vías'],
                'Ambiental' => ['Árboles', 'Plagas', 'Limpieza'],
            ];

            foreach ($parentCategories as $parentName => $children) {
                $parent = IncidentCategory::create(['name' => $parentName]);
                foreach ($children as $childName) {
                    IncidentCategory::create([
                        'name' => $childName,
                        'parent_id' => $parent->id,
                    ]);
                }
            }

            // Obtener las categorías hoja creadas
            $categories = IncidentCategory::whereDoesntHave('children')->get();
        }

        $titles = [
            'Falta de agua potable',
            'Alumbrado público dañado',
            'Bache en la calle',
            'Basura acumulada',
            'Señal de tránsito dañada',
            'Tubería rota',
            'Cables eléctricos caídos',
            'Acera deteriorada',
            'Árbol caído',
            'Desagüe obstruido',
        ];

        $descriptions = [
            'Se requiere reparación inmediata del servicio.',
            'Situación crítica que afecta al sector.',
            'Reportado por ciudadano hace días.',
            'Necesita revisión técnica urgente.',
            'Riesgo para la seguridad pública.',
            'Múltiples quejas de habitantes.',
            'Impacta el flujo vehicular.',
            'Requiere coordinación con otros departamentos.',
            'Daño considerable en la infraestructura.',
            'Situación que empeora diariamente.',
        ];

        $priorities = [IncidentPriority::High->value, IncidentPriority::Medium->value, IncidentPriority::Low->value];
        $statuses = [IncidentStatus::Pending->value, IncidentStatus::InProgress->value, IncidentStatus::Resolved->value];

        // Crear 70 incidencias con datos variados en los últimos 10 días
        for ($i = 0; $i < 70; $i++) {
            $createdAt = now()->subDays(rand(0, 9))->setTime(rand(6, 20), rand(0, 59));
            $status = $statuses[array_rand($statuses)];

            $incident = Incident::create([
                'title' => $titles[array_rand($titles)].' #'.($i + 1),
                'description' => $descriptions[array_rand($descriptions)],
                'priority' => $priorities[
                    // Distribución: 30% alta, 50% media, 20% baja
                    rand(1, 100) <= 30 ? 0 : (rand(1, 100) <= 80 ? 1 : 2)
                ],
                'status' => $status,
                'incident_category_id' => $categories->random()->id,
                'user_id' => $user->id,
                'location_id' => $locations->random()->id,
                'organization_id' => $org->id,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            // Si está resuelto, agregar fecha de resolución
            if ($status === IncidentStatus::Resolved->value) {
                $resolutionDate = $createdAt->copy()->addHours(rand(2, 72));
                $incident->update([
                    'resolution_date' => $resolutionDate,
                ]);
            }
        }

        $this->command->info('✅ Seeder completado: 70 incidencias de prueba creadas.');
        $this->command->info('   - Distribuidas en últimos 10 días');
        $this->command->info('   - 5 categorías diferentes');
        $this->command->info('   - Prioridades: 30% alta, 50% media, 20% baja');
        $this->command->info('   - Estados: ~30% pendiente, ~30% en proceso, ~40% resuelto');
    }
}
