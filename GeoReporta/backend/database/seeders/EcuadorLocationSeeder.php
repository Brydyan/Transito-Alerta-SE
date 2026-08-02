<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Locations\Models\Location;
use Illuminate\Database\Seeder;

class EcuadorLocationSeeder extends Seeder
{
    public function run(): void
    {
        $ecuador = Location::firstOrCreate(
            ['code' => 'EC'],
            ['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]
        );

        foreach ($this->provinces() as $provinceData) {
            $cantons = $provinceData['cantons'];
            unset($provinceData['cantons']);

            $province = Location::firstOrCreate(
                ['code' => $provinceData['code']],
                [...$provinceData, 'level' => 'province', 'parent_id' => $ecuador->id]
            );

            foreach ($cantons as $cantonData) {
                $parishes = $cantonData['parishes'] ?? [];
                unset($cantonData['parishes']);

                $canton = Location::firstOrCreate(
                    ['code' => $cantonData['code']],
                    [...$cantonData, 'level' => 'city', 'parent_id' => $province->id]
                );

                foreach ($parishes as $parishData) {
                    Location::firstOrCreate(
                        ['code' => $parishData['code']],
                        [...$parishData, 'level' => 'neighborhood', 'parent_id' => $canton->id]
                    );
                }
            }
        }
    }

    private function provinces(): array
    {
        return [
            [
                'code' => 'EC-01', 'name' => 'Azuay',
                'cantons' => [
                    [
                        'code' => 'EC-01-01', 'name' => 'Cuenca',
                        'parishes' => [
                            ['code' => 'EC-01-01-01', 'name' => 'Cuenca'],
                            ['code' => 'EC-01-01-02', 'name' => 'Baños'],
                            ['code' => 'EC-01-01-03', 'name' => 'Cañaribamba'],
                            ['code' => 'EC-01-01-04', 'name' => 'El Batán'],
                            ['code' => 'EC-01-01-05', 'name' => 'Gil Ramírez Dávalos'],
                            ['code' => 'EC-01-01-06', 'name' => 'Huayna Cápac'],
                            ['code' => 'EC-01-01-07', 'name' => 'Machángara'],
                            ['code' => 'EC-01-01-08', 'name' => 'Monay'],
                            ['code' => 'EC-01-01-09', 'name' => 'San Blas'],
                            ['code' => 'EC-01-01-10', 'name' => 'San Sebastián'],
                            ['code' => 'EC-01-01-11', 'name' => 'Sucre'],
                            ['code' => 'EC-01-01-12', 'name' => 'Totoracocha'],
                            ['code' => 'EC-01-01-13', 'name' => 'Yanuncay'],
                            ['code' => 'EC-01-01-14', 'name' => 'Bellavista'],
                            ['code' => 'EC-01-01-15', 'name' => 'Hermano Miguel'],
                        ],
                    ],
                    ['code' => 'EC-01-02', 'name' => 'Gualaceo', 'parishes' => []],
                    ['code' => 'EC-01-03', 'name' => 'Nabón', 'parishes' => []],
                    ['code' => 'EC-01-04', 'name' => 'Paute', 'parishes' => []],
                    ['code' => 'EC-01-05', 'name' => 'Pucará', 'parishes' => []],
                    ['code' => 'EC-01-06', 'name' => 'San Fernando', 'parishes' => []],
                    ['code' => 'EC-01-07', 'name' => 'Santa Isabel', 'parishes' => []],
                    ['code' => 'EC-01-08', 'name' => 'Sígsig', 'parishes' => []],
                    ['code' => 'EC-01-09', 'name' => 'Oña', 'parishes' => []],
                    ['code' => 'EC-01-10', 'name' => 'Chordeleg', 'parishes' => []],
                    ['code' => 'EC-01-11', 'name' => 'El Pan', 'parishes' => []],
                    ['code' => 'EC-01-12', 'name' => 'Sevilla de Oro', 'parishes' => []],
                    ['code' => 'EC-01-13', 'name' => 'Guachapala', 'parishes' => []],
                    ['code' => 'EC-01-14', 'name' => 'Camilo Ponce Enríquez', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-02', 'name' => 'Bolívar',
                'cantons' => [
                    ['code' => 'EC-02-01', 'name' => 'Guaranda', 'parishes' => [
                        ['code' => 'EC-02-01-01', 'name' => 'Guaranda'],
                        ['code' => 'EC-02-01-02', 'name' => 'Ángel Polibio Chaves'],
                        ['code' => 'EC-02-01-03', 'name' => 'Guanujo'],
                    ]],
                    ['code' => 'EC-02-02', 'name' => 'Chillanes', 'parishes' => []],
                    ['code' => 'EC-02-03', 'name' => 'Chimbo', 'parishes' => []],
                    ['code' => 'EC-02-04', 'name' => 'Echeandía', 'parishes' => []],
                    ['code' => 'EC-02-05', 'name' => 'San Miguel', 'parishes' => []],
                    ['code' => 'EC-02-06', 'name' => 'Caluma', 'parishes' => []],
                    ['code' => 'EC-02-07', 'name' => 'Las Naves', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-03', 'name' => 'Cañar',
                'cantons' => [
                    ['code' => 'EC-03-01', 'name' => 'Azogues', 'parishes' => [
                        ['code' => 'EC-03-01-01', 'name' => 'Azogues'],
                        ['code' => 'EC-03-01-02', 'name' => 'Aurelio Bayas'],
                        ['code' => 'EC-03-01-03', 'name' => 'Charasol'],
                    ]],
                    ['code' => 'EC-03-02', 'name' => 'Biblián', 'parishes' => []],
                    ['code' => 'EC-03-03', 'name' => 'Cañar', 'parishes' => []],
                    ['code' => 'EC-03-04', 'name' => 'La Troncal', 'parishes' => []],
                    ['code' => 'EC-03-05', 'name' => 'El Tambo', 'parishes' => []],
                    ['code' => 'EC-03-06', 'name' => 'Déleg', 'parishes' => []],
                    ['code' => 'EC-03-07', 'name' => 'Suscal', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-04', 'name' => 'Carchi',
                'cantons' => [
                    ['code' => 'EC-04-01', 'name' => 'Tulcán', 'parishes' => [
                        ['code' => 'EC-04-01-01', 'name' => 'Tulcán'],
                        ['code' => 'EC-04-01-02', 'name' => 'González Suárez'],
                        ['code' => 'EC-04-01-03', 'name' => 'Julio Andrade'],
                    ]],
                    ['code' => 'EC-04-02', 'name' => 'Bolívar', 'parishes' => []],
                    ['code' => 'EC-04-03', 'name' => 'Espejo', 'parishes' => []],
                    ['code' => 'EC-04-04', 'name' => 'Mira', 'parishes' => []],
                    ['code' => 'EC-04-05', 'name' => 'Montúfar', 'parishes' => []],
                    ['code' => 'EC-04-06', 'name' => 'San Pedro de Huaca', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-05', 'name' => 'Cotopaxi',
                'cantons' => [
                    ['code' => 'EC-05-01', 'name' => 'Latacunga', 'parishes' => [
                        ['code' => 'EC-05-01-01', 'name' => 'Eloy Alfaro'],
                        ['code' => 'EC-05-01-02', 'name' => 'Ignacio Flores'],
                        ['code' => 'EC-05-01-03', 'name' => 'Juan Montalvo'],
                        ['code' => 'EC-05-01-04', 'name' => 'La Matriz'],
                        ['code' => 'EC-05-01-05', 'name' => 'San Buenaventura'],
                    ]],
                    ['code' => 'EC-05-02', 'name' => 'La Maná', 'parishes' => []],
                    ['code' => 'EC-05-03', 'name' => 'Pangua', 'parishes' => []],
                    ['code' => 'EC-05-04', 'name' => 'Pujilí', 'parishes' => []],
                    ['code' => 'EC-05-05', 'name' => 'Salcedo', 'parishes' => []],
                    ['code' => 'EC-05-06', 'name' => 'Saquisilí', 'parishes' => []],
                    ['code' => 'EC-05-07', 'name' => 'Sigchos', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-06', 'name' => 'Chimborazo',
                'cantons' => [
                    ['code' => 'EC-06-01', 'name' => 'Riobamba', 'parishes' => [
                        ['code' => 'EC-06-01-01', 'name' => 'Maldonado'],
                        ['code' => 'EC-06-01-02', 'name' => 'Veloz'],
                        ['code' => 'EC-06-01-03', 'name' => 'Lizarzaburu'],
                        ['code' => 'EC-06-01-04', 'name' => 'Velasco'],
                        ['code' => 'EC-06-01-05', 'name' => 'Yaruquíes'],
                    ]],
                    ['code' => 'EC-06-02', 'name' => 'Alausí', 'parishes' => []],
                    ['code' => 'EC-06-03', 'name' => 'Colta', 'parishes' => []],
                    ['code' => 'EC-06-04', 'name' => 'Chambo', 'parishes' => []],
                    ['code' => 'EC-06-05', 'name' => 'Chunchi', 'parishes' => []],
                    ['code' => 'EC-06-06', 'name' => 'Guamote', 'parishes' => []],
                    ['code' => 'EC-06-07', 'name' => 'Guano', 'parishes' => []],
                    ['code' => 'EC-06-08', 'name' => 'Pallatanga', 'parishes' => []],
                    ['code' => 'EC-06-09', 'name' => 'Penipe', 'parishes' => []],
                    ['code' => 'EC-06-10', 'name' => 'Cumandá', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-07', 'name' => 'El Oro',
                'cantons' => [
                    ['code' => 'EC-07-01', 'name' => 'Machala', 'parishes' => [
                        ['code' => 'EC-07-01-01', 'name' => 'Machala'],
                        ['code' => 'EC-07-01-02', 'name' => 'El Cambio'],
                        ['code' => 'EC-07-01-03', 'name' => 'El Retiro'],
                        ['code' => 'EC-07-01-04', 'name' => 'La Providencia'],
                        ['code' => 'EC-07-01-05', 'name' => 'Puerto Bolívar'],
                    ]],
                    ['code' => 'EC-07-02', 'name' => 'Arenillas', 'parishes' => []],
                    ['code' => 'EC-07-03', 'name' => 'Atahualpa', 'parishes' => []],
                    ['code' => 'EC-07-04', 'name' => 'Balsas', 'parishes' => []],
                    ['code' => 'EC-07-05', 'name' => 'Chilla', 'parishes' => []],
                    ['code' => 'EC-07-06', 'name' => 'El Guabo', 'parishes' => []],
                    ['code' => 'EC-07-07', 'name' => 'Huaquillas', 'parishes' => []],
                    ['code' => 'EC-07-08', 'name' => 'Marcabelí', 'parishes' => []],
                    ['code' => 'EC-07-09', 'name' => 'Pasaje', 'parishes' => []],
                    ['code' => 'EC-07-10', 'name' => 'Piñas', 'parishes' => []],
                    ['code' => 'EC-07-11', 'name' => 'Portovelo', 'parishes' => []],
                    ['code' => 'EC-07-12', 'name' => 'Santa Rosa', 'parishes' => []],
                    ['code' => 'EC-07-13', 'name' => 'Zaruma', 'parishes' => []],
                    ['code' => 'EC-07-14', 'name' => 'Las Lajas', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-08', 'name' => 'Esmeraldas',
                'cantons' => [
                    ['code' => 'EC-08-01', 'name' => 'Esmeraldas', 'parishes' => [
                        ['code' => 'EC-08-01-01', 'name' => 'Esmeraldas'],
                        ['code' => 'EC-08-01-02', 'name' => 'Bartolomé Ruiz'],
                        ['code' => 'EC-08-01-03', 'name' => 'Luis Tello'],
                        ['code' => 'EC-08-01-04', 'name' => 'Simón Plata Torres'],
                        ['code' => 'EC-08-01-05', 'name' => '5 de Agosto'],
                    ]],
                    ['code' => 'EC-08-02', 'name' => 'Atacames', 'parishes' => []],
                    ['code' => 'EC-08-03', 'name' => 'Eloy Alfaro', 'parishes' => []],
                    ['code' => 'EC-08-04', 'name' => 'Muisne', 'parishes' => []],
                    ['code' => 'EC-08-05', 'name' => 'Quinindé', 'parishes' => []],
                    ['code' => 'EC-08-06', 'name' => 'San Lorenzo', 'parishes' => []],
                    ['code' => 'EC-08-07', 'name' => 'Rioverde', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-09', 'name' => 'Guayas',
                'cantons' => [
                    ['code' => 'EC-09-01', 'name' => 'Guayaquil', 'parishes' => [
                        ['code' => 'EC-09-01-01', 'name' => 'Ayacucho'],
                        ['code' => 'EC-09-01-02', 'name' => 'Bolívar'],
                        ['code' => 'EC-09-01-03', 'name' => 'Carbo'],
                        ['code' => 'EC-09-01-04', 'name' => 'Febres Cordero'],
                        ['code' => 'EC-09-01-05', 'name' => 'García Moreno'],
                        ['code' => 'EC-09-01-06', 'name' => 'Letamendi'],
                        ['code' => 'EC-09-01-07', 'name' => 'Olmedo'],
                        ['code' => 'EC-09-01-08', 'name' => 'Rocafuerte'],
                        ['code' => 'EC-09-01-09', 'name' => 'Sucre'],
                        ['code' => 'EC-09-01-10', 'name' => 'Tarqui'],
                        ['code' => 'EC-09-01-11', 'name' => 'Urdaneta'],
                        ['code' => 'EC-09-01-12', 'name' => 'Ximena'],
                        ['code' => 'EC-09-01-13', 'name' => 'Pascuales'],
                        ['code' => 'EC-09-01-14', 'name' => 'Chongón'],
                    ]],
                    ['code' => 'EC-09-02', 'name' => 'Alfredo Baquerizo Moreno', 'parishes' => []],
                    ['code' => 'EC-09-03', 'name' => 'Balao', 'parishes' => []],
                    ['code' => 'EC-09-04', 'name' => 'Balzar', 'parishes' => []],
                    ['code' => 'EC-09-05', 'name' => 'Colimes', 'parishes' => []],
                    ['code' => 'EC-09-06', 'name' => 'Daule', 'parishes' => []],
                    ['code' => 'EC-09-07', 'name' => 'Durán', 'parishes' => []],
                    ['code' => 'EC-09-08', 'name' => 'El Empalme', 'parishes' => []],
                    ['code' => 'EC-09-09', 'name' => 'El Triunfo', 'parishes' => []],
                    ['code' => 'EC-09-10', 'name' => 'Milagro', 'parishes' => []],
                    ['code' => 'EC-09-11', 'name' => 'Naranjal', 'parishes' => []],
                    ['code' => 'EC-09-12', 'name' => 'Naranjito', 'parishes' => []],
                    ['code' => 'EC-09-13', 'name' => 'Palestina', 'parishes' => []],
                    ['code' => 'EC-09-14', 'name' => 'Pedro Carbo', 'parishes' => []],
                    ['code' => 'EC-09-15', 'name' => 'Samborondón', 'parishes' => []],
                    ['code' => 'EC-09-16', 'name' => 'Santa Lucía', 'parishes' => []],
                    ['code' => 'EC-09-17', 'name' => 'Salitre', 'parishes' => []],
                    ['code' => 'EC-09-18', 'name' => 'San Jacinto de Yaguachi', 'parishes' => []],
                    ['code' => 'EC-09-19', 'name' => 'Playas', 'parishes' => []],
                    ['code' => 'EC-09-20', 'name' => 'Simón Bolívar', 'parishes' => []],
                    ['code' => 'EC-09-21', 'name' => 'Coronel Marcelino Maridueña', 'parishes' => []],
                    ['code' => 'EC-09-22', 'name' => 'Lomas de Sargentillo', 'parishes' => []],
                    ['code' => 'EC-09-23', 'name' => 'Nobol', 'parishes' => []],
                    ['code' => 'EC-09-24', 'name' => 'General Antonio Elizalde', 'parishes' => []],
                    ['code' => 'EC-09-25', 'name' => 'Isidro Ayora', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-10', 'name' => 'Imbabura',
                'cantons' => [
                    ['code' => 'EC-10-01', 'name' => 'Ibarra', 'parishes' => [
                        ['code' => 'EC-10-01-01', 'name' => 'Caranqui'],
                        ['code' => 'EC-10-01-02', 'name' => 'Alpachaca'],
                        ['code' => 'EC-10-01-03', 'name' => 'El Sagrario'],
                        ['code' => 'EC-10-01-04', 'name' => 'San Francisco'],
                        ['code' => 'EC-10-01-05', 'name' => 'La Dolorosa de Priorato'],
                    ]],
                    ['code' => 'EC-10-02', 'name' => 'Antonio Ante', 'parishes' => []],
                    ['code' => 'EC-10-03', 'name' => 'Cotacachi', 'parishes' => []],
                    ['code' => 'EC-10-04', 'name' => 'Otavalo', 'parishes' => []],
                    ['code' => 'EC-10-05', 'name' => 'Pimampiro', 'parishes' => []],
                    ['code' => 'EC-10-06', 'name' => 'Urcuquí', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-11', 'name' => 'Loja',
                'cantons' => [
                    ['code' => 'EC-11-01', 'name' => 'Loja', 'parishes' => [
                        ['code' => 'EC-11-01-01', 'name' => 'El Sagrario'],
                        ['code' => 'EC-11-01-02', 'name' => 'El Valle'],
                        ['code' => 'EC-11-01-03', 'name' => 'Punzara'],
                        ['code' => 'EC-11-01-04', 'name' => 'Sucre'],
                        ['code' => 'EC-11-01-05', 'name' => 'San Sebastián'],
                    ]],
                    ['code' => 'EC-11-02', 'name' => 'Calvas', 'parishes' => []],
                    ['code' => 'EC-11-03', 'name' => 'Catamayo', 'parishes' => []],
                    ['code' => 'EC-11-04', 'name' => 'Celica', 'parishes' => []],
                    ['code' => 'EC-11-05', 'name' => 'Chaguarpamba', 'parishes' => []],
                    ['code' => 'EC-11-06', 'name' => 'Espíndola', 'parishes' => []],
                    ['code' => 'EC-11-07', 'name' => 'Gonzanamá', 'parishes' => []],
                    ['code' => 'EC-11-08', 'name' => 'Macará', 'parishes' => []],
                    ['code' => 'EC-11-09', 'name' => 'Paltas', 'parishes' => []],
                    ['code' => 'EC-11-10', 'name' => 'Puyango', 'parishes' => []],
                    ['code' => 'EC-11-11', 'name' => 'Saraguro', 'parishes' => []],
                    ['code' => 'EC-11-12', 'name' => 'Sozoranga', 'parishes' => []],
                    ['code' => 'EC-11-13', 'name' => 'Zapotillo', 'parishes' => []],
                    ['code' => 'EC-11-14', 'name' => 'Pindal', 'parishes' => []],
                    ['code' => 'EC-11-15', 'name' => 'Quilanga', 'parishes' => []],
                    ['code' => 'EC-11-16', 'name' => 'Olmedo', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-12', 'name' => 'Los Ríos',
                'cantons' => [
                    ['code' => 'EC-12-01', 'name' => 'Babahoyo', 'parishes' => [
                        ['code' => 'EC-12-01-01', 'name' => 'Babahoyo'],
                        ['code' => 'EC-12-01-02', 'name' => 'Clemente Baquerizo'],
                        ['code' => 'EC-12-01-03', 'name' => 'Dr. Camilo Ponce Enríquez'],
                        ['code' => 'EC-12-01-04', 'name' => 'Febres Cordero'],
                    ]],
                    ['code' => 'EC-12-02', 'name' => 'Baba', 'parishes' => []],
                    ['code' => 'EC-12-03', 'name' => 'Montalvo', 'parishes' => []],
                    ['code' => 'EC-12-04', 'name' => 'Pueblo Viejo', 'parishes' => []],
                    ['code' => 'EC-12-05', 'name' => 'Quevedo', 'parishes' => []],
                    ['code' => 'EC-12-06', 'name' => 'Urdaneta', 'parishes' => []],
                    ['code' => 'EC-12-07', 'name' => 'Ventanas', 'parishes' => []],
                    ['code' => 'EC-12-08', 'name' => 'Vinces', 'parishes' => []],
                    ['code' => 'EC-12-09', 'name' => 'Palenque', 'parishes' => []],
                    ['code' => 'EC-12-10', 'name' => 'Buena Fé', 'parishes' => []],
                    ['code' => 'EC-12-11', 'name' => 'Valencia', 'parishes' => []],
                    ['code' => 'EC-12-12', 'name' => 'Mocache', 'parishes' => []],
                    ['code' => 'EC-12-13', 'name' => 'Quinsaloma', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-13', 'name' => 'Manabí',
                'cantons' => [
                    ['code' => 'EC-13-01', 'name' => 'Portoviejo', 'parishes' => [
                        ['code' => 'EC-13-01-01', 'name' => '12 de Marzo'],
                        ['code' => 'EC-13-01-02', 'name' => '18 de Octubre'],
                        ['code' => 'EC-13-01-03', 'name' => 'Andrés de Vera'],
                        ['code' => 'EC-13-01-04', 'name' => 'Colón'],
                        ['code' => 'EC-13-01-05', 'name' => 'Francisco Pacheco'],
                        ['code' => 'EC-13-01-06', 'name' => 'Picoazá'],
                        ['code' => 'EC-13-01-07', 'name' => 'San Pablo'],
                        ['code' => 'EC-13-01-08', 'name' => 'Simón Bolívar'],
                    ]],
                    ['code' => 'EC-13-02', 'name' => 'Bolívar', 'parishes' => []],
                    ['code' => 'EC-13-03', 'name' => 'Chone', 'parishes' => []],
                    ['code' => 'EC-13-04', 'name' => 'El Carmen', 'parishes' => []],
                    ['code' => 'EC-13-05', 'name' => 'Flavio Alfaro', 'parishes' => []],
                    ['code' => 'EC-13-06', 'name' => 'Jipijapa', 'parishes' => []],
                    ['code' => 'EC-13-07', 'name' => 'Junín', 'parishes' => []],
                    ['code' => 'EC-13-08', 'name' => 'Manta', 'parishes' => []],
                    ['code' => 'EC-13-09', 'name' => 'Montecristi', 'parishes' => []],
                    ['code' => 'EC-13-10', 'name' => 'Paján', 'parishes' => []],
                    ['code' => 'EC-13-11', 'name' => 'Pichincha', 'parishes' => []],
                    ['code' => 'EC-13-12', 'name' => 'Rocafuerte', 'parishes' => []],
                    ['code' => 'EC-13-13', 'name' => 'Santa Ana', 'parishes' => []],
                    ['code' => 'EC-13-14', 'name' => 'Sucre', 'parishes' => []],
                    ['code' => 'EC-13-15', 'name' => 'Tosagua', 'parishes' => []],
                    ['code' => 'EC-13-16', 'name' => '24 de Mayo', 'parishes' => []],
                    ['code' => 'EC-13-17', 'name' => 'Pedernales', 'parishes' => []],
                    ['code' => 'EC-13-18', 'name' => 'Olmedo', 'parishes' => []],
                    ['code' => 'EC-13-19', 'name' => 'Puerto López', 'parishes' => []],
                    ['code' => 'EC-13-20', 'name' => 'Jama', 'parishes' => []],
                    ['code' => 'EC-13-21', 'name' => 'Jaramijó', 'parishes' => []],
                    ['code' => 'EC-13-22', 'name' => 'San Vicente', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-14', 'name' => 'Morona Santiago',
                'cantons' => [
                    ['code' => 'EC-14-01', 'name' => 'Morona', 'parishes' => [
                        ['code' => 'EC-14-01-01', 'name' => 'Macas'],
                        ['code' => 'EC-14-01-02', 'name' => 'General Proaño'],
                        ['code' => 'EC-14-01-03', 'name' => 'Zuña'],
                    ]],
                    ['code' => 'EC-14-02', 'name' => 'Gualaquiza', 'parishes' => []],
                    ['code' => 'EC-14-03', 'name' => 'Limón Indanza', 'parishes' => []],
                    ['code' => 'EC-14-04', 'name' => 'Palora', 'parishes' => []],
                    ['code' => 'EC-14-05', 'name' => 'Santiago', 'parishes' => []],
                    ['code' => 'EC-14-06', 'name' => 'Sucúa', 'parishes' => []],
                    ['code' => 'EC-14-07', 'name' => 'Huamboya', 'parishes' => []],
                    ['code' => 'EC-14-08', 'name' => 'San Juan Bosco', 'parishes' => []],
                    ['code' => 'EC-14-09', 'name' => 'Taisha', 'parishes' => []],
                    ['code' => 'EC-14-10', 'name' => 'Logroño', 'parishes' => []],
                    ['code' => 'EC-14-11', 'name' => 'Pablo Sexto', 'parishes' => []],
                    ['code' => 'EC-14-12', 'name' => 'Tiwintza', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-15', 'name' => 'Napo',
                'cantons' => [
                    ['code' => 'EC-15-01', 'name' => 'Tena', 'parishes' => [
                        ['code' => 'EC-15-01-01', 'name' => 'Tena'],
                        ['code' => 'EC-15-01-02', 'name' => 'Ahuano'],
                        ['code' => 'EC-15-01-03', 'name' => 'Puerto Misahuallí'],
                    ]],
                    ['code' => 'EC-15-02', 'name' => 'Archidona', 'parishes' => []],
                    ['code' => 'EC-15-03', 'name' => 'El Chaco', 'parishes' => []],
                    ['code' => 'EC-15-04', 'name' => 'Quijos', 'parishes' => []],
                    ['code' => 'EC-15-05', 'name' => 'Carlos Julio Arosemena Tola', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-16', 'name' => 'Pastaza',
                'cantons' => [
                    ['code' => 'EC-16-01', 'name' => 'Pastaza', 'parishes' => [
                        ['code' => 'EC-16-01-01', 'name' => 'Puyo'],
                        ['code' => 'EC-16-01-02', 'name' => 'Fátima'],
                        ['code' => 'EC-16-01-03', 'name' => 'Tarqui'],
                        ['code' => 'EC-16-01-04', 'name' => 'Veracruz'],
                    ]],
                    ['code' => 'EC-16-02', 'name' => 'Mera', 'parishes' => []],
                    ['code' => 'EC-16-03', 'name' => 'Santa Clara', 'parishes' => []],
                    ['code' => 'EC-16-04', 'name' => 'Arajuno', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-17', 'name' => 'Pichincha',
                'cantons' => [
                    ['code' => 'EC-17-01', 'name' => 'Quito', 'parishes' => [
                        ['code' => 'EC-17-01-01', 'name' => 'Belisario Quevedo'],
                        ['code' => 'EC-17-01-02', 'name' => 'Calderón'],
                        ['code' => 'EC-17-01-03', 'name' => 'Carcelén'],
                        ['code' => 'EC-17-01-04', 'name' => 'Centro Histórico'],
                        ['code' => 'EC-17-01-05', 'name' => 'Chillogallo'],
                        ['code' => 'EC-17-01-06', 'name' => 'Chimbacalle'],
                        ['code' => 'EC-17-01-07', 'name' => 'Cochapamba'],
                        ['code' => 'EC-17-01-08', 'name' => 'El Condado'],
                        ['code' => 'EC-17-01-09', 'name' => 'Guamaní'],
                        ['code' => 'EC-17-01-10', 'name' => 'Iñaquito'],
                        ['code' => 'EC-17-01-11', 'name' => 'Jipijapa'],
                        ['code' => 'EC-17-01-12', 'name' => 'Kennedy'],
                        ['code' => 'EC-17-01-13', 'name' => 'La Argelia'],
                        ['code' => 'EC-17-01-14', 'name' => 'La Concepción'],
                        ['code' => 'EC-17-01-15', 'name' => 'La Ecuatoriana'],
                        ['code' => 'EC-17-01-16', 'name' => 'La Ferroviaria'],
                        ['code' => 'EC-17-01-17', 'name' => 'La Libertad'],
                        ['code' => 'EC-17-01-18', 'name' => 'La Magdalena'],
                        ['code' => 'EC-17-01-19', 'name' => 'La Mena'],
                        ['code' => 'EC-17-01-20', 'name' => 'Mariscal Sucre'],
                        ['code' => 'EC-17-01-21', 'name' => 'Ponceano'],
                        ['code' => 'EC-17-01-22', 'name' => 'Puengasí'],
                        ['code' => 'EC-17-01-23', 'name' => 'Quitumbe'],
                        ['code' => 'EC-17-01-24', 'name' => 'Rumipamba'],
                        ['code' => 'EC-17-01-25', 'name' => 'San Bartolo'],
                        ['code' => 'EC-17-01-26', 'name' => 'San Juan'],
                        ['code' => 'EC-17-01-27', 'name' => 'Solanda'],
                        ['code' => 'EC-17-01-28', 'name' => 'Turubamba'],
                        ['code' => 'EC-17-01-29', 'name' => 'Cotocollao'],
                        ['code' => 'EC-17-01-30', 'name' => 'Comité del Pueblo'],
                    ]],
                    ['code' => 'EC-17-02', 'name' => 'Cayambe', 'parishes' => []],
                    ['code' => 'EC-17-03', 'name' => 'Mejía', 'parishes' => []],
                    ['code' => 'EC-17-04', 'name' => 'Pedro Moncayo', 'parishes' => []],
                    ['code' => 'EC-17-05', 'name' => 'Rumiñahui', 'parishes' => []],
                    ['code' => 'EC-17-06', 'name' => 'San Miguel de los Bancos', 'parishes' => []],
                    ['code' => 'EC-17-07', 'name' => 'Pedro Vicente Maldonado', 'parishes' => []],
                    ['code' => 'EC-17-08', 'name' => 'Puerto Quito', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-18', 'name' => 'Tungurahua',
                'cantons' => [
                    ['code' => 'EC-18-01', 'name' => 'Ambato', 'parishes' => [
                        ['code' => 'EC-18-01-01', 'name' => 'Atocha-Ficoa'],
                        ['code' => 'EC-18-01-02', 'name' => 'Celiano Monge'],
                        ['code' => 'EC-18-01-03', 'name' => 'Huachi Chico'],
                        ['code' => 'EC-18-01-04', 'name' => 'Huachi Grande'],
                        ['code' => 'EC-18-01-05', 'name' => 'La Merced'],
                        ['code' => 'EC-18-01-06', 'name' => 'La Matriz'],
                        ['code' => 'EC-18-01-07', 'name' => 'Pishilata'],
                        ['code' => 'EC-18-01-08', 'name' => 'San Francisco'],
                    ]],
                    ['code' => 'EC-18-02', 'name' => 'Ambato', 'parishes' => []],
                    ['code' => 'EC-18-03', 'name' => 'Baños de Agua Santa', 'parishes' => []],
                    ['code' => 'EC-18-04', 'name' => 'Cevallos', 'parishes' => []],
                    ['code' => 'EC-18-05', 'name' => 'Mocha', 'parishes' => []],
                    ['code' => 'EC-18-06', 'name' => 'Patate', 'parishes' => []],
                    ['code' => 'EC-18-07', 'name' => 'Quero', 'parishes' => []],
                    ['code' => 'EC-18-08', 'name' => 'San Pedro de Pelileo', 'parishes' => []],
                    ['code' => 'EC-18-09', 'name' => 'Santiago de Píllaro', 'parishes' => []],
                    ['code' => 'EC-18-10', 'name' => 'Tisaleo', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-19', 'name' => 'Zamora Chinchipe',
                'cantons' => [
                    ['code' => 'EC-19-01', 'name' => 'Zamora', 'parishes' => [
                        ['code' => 'EC-19-01-01', 'name' => 'Zamora'],
                        ['code' => 'EC-19-01-02', 'name' => 'Cumbaratza'],
                        ['code' => 'EC-19-01-03', 'name' => 'Timbara'],
                    ]],
                    ['code' => 'EC-19-02', 'name' => 'Chinchipe', 'parishes' => []],
                    ['code' => 'EC-19-03', 'name' => 'Nangaritza', 'parishes' => []],
                    ['code' => 'EC-19-04', 'name' => 'Yacuambi', 'parishes' => []],
                    ['code' => 'EC-19-05', 'name' => 'Yantzaza', 'parishes' => []],
                    ['code' => 'EC-19-06', 'name' => 'El Pangui', 'parishes' => []],
                    ['code' => 'EC-19-07', 'name' => 'Centinela del Cóndor', 'parishes' => []],
                    ['code' => 'EC-19-08', 'name' => 'Palanda', 'parishes' => []],
                    ['code' => 'EC-19-09', 'name' => 'Paquisha', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-20', 'name' => 'Galápagos',
                'cantons' => [
                    ['code' => 'EC-20-01', 'name' => 'San Cristóbal', 'parishes' => [
                        ['code' => 'EC-20-01-01', 'name' => 'Puerto Baquerizo Moreno'],
                        ['code' => 'EC-20-01-02', 'name' => 'El Progreso'],
                    ]],
                    ['code' => 'EC-20-02', 'name' => 'Isabela', 'parishes' => [
                        ['code' => 'EC-20-02-01', 'name' => 'Puerto Villamil'],
                    ]],
                    ['code' => 'EC-20-03', 'name' => 'Santa Cruz', 'parishes' => [
                        ['code' => 'EC-20-03-01', 'name' => 'Puerto Ayora'],
                        ['code' => 'EC-20-03-02', 'name' => 'Bellavista'],
                        ['code' => 'EC-20-03-03', 'name' => 'Santa Rosa'],
                    ]],
                ],
            ],
            [
                'code' => 'EC-21', 'name' => 'Sucumbíos',
                'cantons' => [
                    ['code' => 'EC-21-01', 'name' => 'Lago Agrio', 'parishes' => [
                        ['code' => 'EC-21-01-01', 'name' => 'Nueva Loja'],
                        ['code' => 'EC-21-01-02', 'name' => 'Dureno'],
                        ['code' => 'EC-21-01-03', 'name' => 'El Eno'],
                    ]],
                    ['code' => 'EC-21-02', 'name' => 'Cascales', 'parishes' => []],
                    ['code' => 'EC-21-03', 'name' => 'Cuyabeno', 'parishes' => []],
                    ['code' => 'EC-21-04', 'name' => 'Gonzalo Pizarro', 'parishes' => []],
                    ['code' => 'EC-21-05', 'name' => 'Putumayo', 'parishes' => []],
                    ['code' => 'EC-21-06', 'name' => 'Shushufindi', 'parishes' => []],
                    ['code' => 'EC-21-07', 'name' => 'Sucumbíos', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-22', 'name' => 'Orellana',
                'cantons' => [
                    ['code' => 'EC-22-01', 'name' => 'Francisco de Orellana', 'parishes' => [
                        ['code' => 'EC-22-01-01', 'name' => 'Puerto Francisco de Orellana'],
                        ['code' => 'EC-22-01-02', 'name' => 'Dayuma'],
                        ['code' => 'EC-22-01-03', 'name' => 'Taracoa'],
                    ]],
                    ['code' => 'EC-22-02', 'name' => 'Aguarico', 'parishes' => []],
                    ['code' => 'EC-22-03', 'name' => 'La Joya de los Sachas', 'parishes' => []],
                    ['code' => 'EC-22-04', 'name' => 'Loreto', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-23', 'name' => 'Santo Domingo de los Tsáchilas',
                'cantons' => [
                    ['code' => 'EC-23-01', 'name' => 'Santo Domingo', 'parishes' => [
                        ['code' => 'EC-23-01-01', 'name' => 'Santo Domingo'],
                        ['code' => 'EC-23-01-02', 'name' => 'Abraham Calazacón'],
                        ['code' => 'EC-23-01-03', 'name' => 'Bombolí'],
                        ['code' => 'EC-23-01-04', 'name' => 'Chigüilpe'],
                        ['code' => 'EC-23-01-05', 'name' => 'Río Verde'],
                        ['code' => 'EC-23-01-06', 'name' => 'Zaracay'],
                    ]],
                    ['code' => 'EC-23-02', 'name' => 'La Concordia', 'parishes' => []],
                ],
            ],
            [
                'code' => 'EC-24', 'name' => 'Santa Elena',
                'cantons' => [
                    ['code' => 'EC-24-01', 'name' => 'Santa Elena', 'parishes' => [
                        ['code' => 'EC-24-01-01', 'name' => 'Santa Elena'],
                        ['code' => 'EC-24-01-02', 'name' => 'Anconcito'],
                        ['code' => 'EC-24-01-03', 'name' => 'Atahualpa'],
                    ]],
                    ['code' => 'EC-24-02', 'name' => 'La Libertad', 'parishes' => [
                        ['code' => 'EC-24-02-01', 'name' => 'La Libertad'],
                    ]],
                    ['code' => 'EC-24-03', 'name' => 'Salinas', 'parishes' => [
                        ['code' => 'EC-24-03-01', 'name' => 'Salinas'],
                        ['code' => 'EC-24-03-02', 'name' => 'José Luis Tamayo'],
                    ]],
                ],
            ],
        ];
    }
}
