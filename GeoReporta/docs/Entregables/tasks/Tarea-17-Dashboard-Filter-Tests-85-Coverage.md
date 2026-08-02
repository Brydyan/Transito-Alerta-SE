# 📋 TAREA 06 — Dashboard Filter Integration Tests

**Asignado a**: Integrante Testing/Backend (Alisson)  
**Prioridad**: 🟡 ALTA  
**Estimado**: 4-5 horas  
**Dificultad**: Media  
**Sprint**: THIS WEEK  

---

## 📌 DESCRIPCIÓN

Module 08 (Dashboard) filter tests incomplete. E4/E5 marked 60% coverage. Need integration tests for:
- Date range validation (inicio ≤ fin)
- Type/Category filtering
- Location cascade (país → provincia → ciudad)
- Combined filters
- Permission checks

**Objetivo**: Boost Dashboard test coverage 60% → 85%+

---

## 🎯 IMPACTO

- **Before**: M08 coverage 60%; filters not systematically tested
- **After**: M08 coverage 85%+; all filter paths tested
- **Gain**: Dashboard bugs caught before production

---

## 📁 ARCHIVO A MODIFICAR

```
backend/tests/Feature/Incidents/IncidentStatsControllerTest.php (EXPAND)
```

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Step 1: Review Existing Test File
**File**: `backend/tests/Feature/Incidents/IncidentStatsControllerTest.php`

**Current coverage** (estimate):
- ✅ Basic stats (total, by_status)
- ❌ Date range validation
- ❌ Type filtering
- ❌ Location filtering
- ❌ Permission checks

---

### Step 2: Add Comprehensive Filter Tests

**Agregar al archivo** (después de existing tests):

```php
<?php

namespace Tests\Feature\Incidents;

use App\Models\Incident;
use App\Models\IncidentCategory;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncidentStatsControllerTest extends TestCase
{
    use RefreshDatabase;
    
    protected User $admin;
    protected Location $locationEcuador;
    protected Location $locationSantaElena;
    
    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['role_id' => 1]); // admin_sistema
        
        // Create location hierarchy
        $this->locationEcuador = Location::factory()->create([
            'name' => 'Ecuador',
            'level' => 'pais',
            'parent_id' => null
        ]);
        
        $this->locationSantaElena = Location::factory()->create([
            'name' => 'Santa Elena',
            'level' => 'provincia',
            'parent_id' => $this->locationEcuador->id
        ]);
    }
    
    // ==================== DATE RANGE TESTS ====================
    
    public function test_stats_accepts_valid_date_range()
    {
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?inicio=2026-07-01&fin=2026-07-14'
        );
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('total', $response->json());
    }
    
    public function test_stats_rejects_invalid_date_format()
    {
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?inicio=01-07-2026&fin=14-07-2026'  // DD-MM-YYYY (wrong)
        );
        
        $response->assertStatus(422);
        $this->assertArrayHasKey('inicio', $response->json('errors'));
    }
    
    public function test_stats_rejects_fin_before_inicio()
    {
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?inicio=2026-07-14&fin=2026-07-01'  // fin < inicio
        );
        
        $response->assertStatus(422);
        $this->assertArrayHasKey('fin', $response->json('errors'));
        $this->assertStringContainsString('no puede ser anterior', 
            $response->json('errors.fin.0')
        );
    }
    
    public function test_stats_accepts_fin_equals_inicio()
    {
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?inicio=2026-07-14&fin=2026-07-14'  // Same day OK
        );
        
        $response->assertStatus(200);
    }
    
    public function test_stats_date_range_filters_incidents()
    {
        // Create incidents on different dates
        Incident::factory()->create([
            'created_at' => now()->subDays(10),  // Outside range
            'status' => 'pendiente'
        ]);
        
        Incident::factory()->create([
            'created_at' => now()->subDays(5),   // Inside range
            'status' => 'pendiente'
        ]);
        
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?inicio=' . now()->subDays(7)->format('Y-m-d') . 
            '&fin=' . now()->format('Y-m-d')
        );
        
        // Should only count incident from 5 days ago
        $this->assertEquals(1, $response->json('total'));
    }
    
    // ==================== TYPE/CATEGORY FILTERING TESTS ====================
    
    public function test_stats_filter_by_category()
    {
        $category = IncidentCategory::factory()->create([
            'name' => 'Infraestructura'
        ]);
        
        Incident::factory(5)->create([
            'incident_category_id' => $category->id
        ]);
        
        Incident::factory(3)->create(); // Different category
        
        $response = $this->actingAs($this->admin)->get(
            "/api/incidents/stats?tipo_id={$category->id}"
        );
        
        $this->assertEquals(5, $response->json('total'));
    }
    
    public function test_stats_filter_invalid_category()
    {
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?tipo_id=9999'  // Non-existent
        );
        
        // Should return 0 results, not error
        $response->assertStatus(200);
        $this->assertEquals(0, $response->json('total'));
    }
    
    // ==================== LOCATION FILTERING TESTS ====================
    
    public function test_stats_filter_by_city()
    {
        $city = Location::factory()->create([
            'level' => 'ciudad',
            'parent_id' => $this->locationSantaElena->id
        ]);
        
        Incident::factory(4)->create([
            'location_id' => $city->id
        ]);
        
        Incident::factory(2)->create(); // Different city
        
        $response = $this->actingAs($this->admin)->get(
            "/api/incidents/stats?ciudad_id={$city->id}"
        );
        
        $this->assertEquals(4, $response->json('total'));
    }
    
    public function test_stats_filter_by_province()
    {
        // Locations under this province
        $city1 = Location::factory()->create([
            'level' => 'ciudad',
            'parent_id' => $this->locationSantaElena->id
        ]);
        
        $city2 = Location::factory()->create([
            'level' => 'ciudad',
            'parent_id' => $this->locationSantaElena->id
        ]);
        
        Incident::factory(3)->create(['location_id' => $city1->id]);
        Incident::factory(2)->create(['location_id' => $city2->id]);
        Incident::factory(1)->create(); // Different province
        
        $response = $this->actingAs($this->admin)->get(
            "/api/incidents/stats?provincia_id={$this->locationSantaElena->id}"
        );
        
        // Should include all cities under Santa Elena
        $this->assertEquals(5, $response->json('total'));
    }
    
    public function test_stats_filter_by_country()
    {
        $city = Location::factory()->create([
            'level' => 'ciudad',
            'parent_id' => $this->locationSantaElena->id
        ]);
        
        Incident::factory(10)->create(['location_id' => $city->id]);
        
        $response = $this->actingAs($this->admin)->get(
            "/api/incidents/stats?pais_id={$this->locationEcuador->id}"
        );
        
        $this->assertEquals(10, $response->json('total'));
    }
    
    // ==================== COMBINED FILTER TESTS ====================
    
    public function test_stats_filter_by_date_and_category()
    {
        $category = IncidentCategory::factory()->create();
        
        Incident::factory()->create([
            'incident_category_id' => $category->id,
            'created_at' => now()->subDays(10)  // Outside range
        ]);
        
        Incident::factory()->create([
            'incident_category_id' => $category->id,
            'created_at' => now()->subDays(2)   // Inside range
        ]);
        
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?' .
            'inicio=' . now()->subDays(5)->format('Y-m-d') . '&' .
            'fin=' . now()->format('Y-m-d') . '&' .
            "tipo_id={$category->id}"
        );
        
        $this->assertEquals(1, $response->json('total'));
    }
    
    public function test_stats_filter_date_category_location()
    {
        $category = IncidentCategory::factory()->create();
        $city = Location::factory()->create([
            'level' => 'ciudad',
            'parent_id' => $this->locationSantaElena->id
        ]);
        
        Incident::factory()->create([
            'incident_category_id' => $category->id,
            'location_id' => $city->id,
            'created_at' => now()->subDays(2)
        ]);
        
        Incident::factory()->create(); // Different category/location
        
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats?' .
            'inicio=' . now()->subDays(5)->format('Y-m-d') . '&' .
            'fin=' . now()->format('Y-m-d') . '&' .
            "tipo_id={$category->id}&" .
            "ciudad_id={$city->id}"
        );
        
        $this->assertEquals(1, $response->json('total'));
    }
    
    // ==================== AGGREGATION TESTS ====================
    
    public function test_stats_returns_correct_by_status_breakdown()
    {
        Incident::factory(3)->create(['status' => 'pendiente']);
        Incident::factory(2)->create(['status' => 'en_proceso']);
        Incident::factory(1)->create(['status' => 'resuelto']);
        
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats'
        );
        
        $byStatus = $response->json('by_status');
        $this->assertEquals(3, $byStatus['pendiente']);
        $this->assertEquals(2, $byStatus['en_proceso']);
        $this->assertEquals(1, $byStatus['resuelto']);
    }
    
    public function test_stats_average_resolution_time_calculated()
    {
        Incident::factory()->create([
            'created_at' => now()->subHours(2),
            'status' => 'resuelto',
            'resolved_at' => now()
        ]);
        
        $response = $this->actingAs($this->admin)->get(
            '/api/incidents/stats'
        );
        
        $this->assertArrayHasKey('average_resolution_time', $response->json());
        $this->assertNotEmpty($response->json('average_resolution_time'));
    }
    
    // ==================== PERMISSION TESTS ====================
    
    public function test_unauthenticated_cannot_view_stats()
    {
        $response = $this->get('/api/incidents/stats');
        $response->assertStatus(401);
    }
    
    public function test_operador_can_view_stats()
    {
        $operador = User::factory()->create(['role_id' => 3]); // operador_sistema
        
        $response = $this->actingAs($operador)->get('/api/incidents/stats');
        $response->assertStatus(200);
    }
}
```

---

### Step 3: Run All Tests
**Terminal**:

```bash
# Run dashboard filter tests
php artisan test tests/Feature/Incidents/IncidentStatsControllerTest.php --verbose

# Run with coverage
php artisan test tests/Feature/Incidents/IncidentStatsControllerTest.php --coverage
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] 15+ new test methods added to IncidentStatsControllerTest
- [ ] Date range tests (valid, invalid, boundary cases)
- [ ] Category/Type filtering tests
- [ ] Location cascade filtering tests (city, province, country)
- [ ] Combined filter tests
- [ ] Aggregation validation tests
- [ ] Permission tests
- [ ] All tests PASS: `php artisan test`
- [ ] Coverage >= 85% for IncidentStatsController

---

## 🧪 VERIFICATION

```bash
# 1. Run all dashboard tests
php artisan test tests/Feature/Incidents/IncidentStatsControllerTest.php

# 2. Check specific filter test
php artisan test tests/Feature/Incidents/IncidentStatsControllerTest.php --filter "date_range"

# 3. Generate coverage report
php artisan test tests/Feature/Incidents/IncidentStatsControllerTest.php --coverage --min=85
```

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Alisson  
**Fecha inicio**: 2026-07-15  
**Fecha fin estimada**: 2026-07-16

