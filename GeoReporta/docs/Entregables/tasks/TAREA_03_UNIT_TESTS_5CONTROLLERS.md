# 📋 TAREA 03 — Unit Tests: 5 Untested Controllers

**Asignado a**: Integrante Testing/Backend (Alisson)  
**Prioridad**: 🔴 CRÍTICA  
**Estimado**: 3-4 horas  
**Dificultad**: Media  
**Sprint**: TODAY + THIS WEEK  

---

## 📌 DESCRIPCIÓN

5 controller classes tienen **CERO unit tests**:
1. `CommentController` — Agregar, listar, eliminar comentarios
2. `MenuController` — Gestión menús dinámicos
3. `FeedController` — Feed actividad
4. `RoleController` — Gestión de roles
5. `UserController` — CRUD usuarios

**Objetivo**: Crear test suite para cada controller (CRUD + permissions + org scoping).

---

## 🎯 IMPACTO

- **Antes**: 30-40% de bugs escapan a producción (no hay blast radius visibility)
- **Después**: 85%+ test coverage; bugs detectados antes
- **Ganancia**: Refactorización segura; confianza en changes

---

## 📁 ARCHIVOS A CREAR

```
backend/tests/Feature/Comments/CommentControllerTest.php          (NEW)
backend/tests/Feature/Menus/MenuControllerTest.php                (NEW)
backend/tests/Feature/Feeds/FeedControllerTest.php                (NEW)
backend/tests/Feature/Roles/RoleControllerTest.php                (NEW)
backend/tests/Feature/Users/UserControllerTest.php                (NEW)
```

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Paso 1: Create CommentControllerTest
**Archivo**: `backend/tests/Feature/Comments/CommentControllerTest.php`

**Contenido**:
```php
<?php

namespace Tests\Feature\Comments;

use App\Models\Comment;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommentControllerTest extends TestCase
{
    use RefreshDatabase;
    
    protected User $user;
    protected Incident $incident;
    
    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['role_id' => 3]); // operador
        $this->incident = Incident::factory()->create();
    }
    
    // CRUD TESTS
    public function test_can_create_comment()
    {
        $response = $this->actingAs($this->user)->post(
            "/api/incidents/{$this->incident->id}/comments",
            ['message' => 'Test comment']
        );
        
        $response->assertStatus(201);
        $this->assertDatabaseHas('comments', [
            'incident_id' => $this->incident->id,
            'user_id' => $this->user->id,
            'message' => 'Test comment'
        ]);
    }
    
    public function test_can_list_comments_by_incident()
    {
        Comment::factory(3)->create(['incident_id' => $this->incident->id]);
        
        $response = $this->actingAs($this->user)->get(
            "/api/incidents/{$this->incident->id}/comments"
        );
        
        $response->assertStatus(200);
        $this->assertCount(3, $response->json('data'));
    }
    
    public function test_comments_ordered_by_created_at_desc()
    {
        $comment1 = Comment::factory()->create(['incident_id' => $this->incident->id, 'created_at' => now()->subHour()]);
        $comment2 = Comment::factory()->create(['incident_id' => $this->incident->id, 'created_at' => now()]);
        
        $response = $this->actingAs($this->user)->get(
            "/api/incidents/{$this->incident->id}/comments"
        );
        
        $data = $response->json('data');
        $this->assertEquals($comment2->id, $data[0]['id']); // Most recent first
    }
    
    public function test_can_delete_own_comment()
    {
        $comment = Comment::factory()->create([
            'incident_id' => $this->incident->id,
            'user_id' => $this->user->id
        ]);
        
        $response = $this->actingAs($this->user)->delete(
            "/api/incidents/{$this->incident->id}/comments/{$comment->id}"
        );
        
        $response->assertStatus(204);
        $this->assertDatabaseMissing('comments', ['id' => $comment->id]);
    }
    
    public function test_cannot_delete_others_comment()
    {
        $otherUser = User::factory()->create(['role_id' => 3]);
        $comment = Comment::factory()->create([
            'incident_id' => $this->incident->id,
            'user_id' => $otherUser->id
        ]);
        
        $response = $this->actingAs($this->user)->delete(
            "/api/incidents/{$this->incident->id}/comments/{$comment->id}"
        );
        
        $response->assertStatus(403); // Forbidden
    }
    
    // PERMISSION TESTS
    public function test_unauthenticated_cannot_create_comment()
    {
        $response = $this->post(
            "/api/incidents/{$this->incident->id}/comments",
            ['message' => 'Test']
        );
        
        $response->assertStatus(401); // Unauthorized
    }
    
    public function test_validation_message_required()
    {
        $response = $this->actingAs($this->user)->post(
            "/api/incidents/{$this->incident->id}/comments",
            ['message' => ''] // Empty
        );
        
        $response->assertStatus(422);
        $this->assertArrayHasKey('message', $response->json('errors'));
    }
    
    public function test_org_scoping_comment_list()
    {
        // TODO: Implementar cuando multitenant completed
        // Comments debe filtrar por org del usuario
    }
}
```

**¿Cómo ejecutar?**:
```bash
php artisan test tests/Feature/Comments/CommentControllerTest.php
```

---

### Paso 2: Create MenuControllerTest
**Archivo**: `backend/tests/Feature/Menus/MenuControllerTest.php`

**Minimal test structure** (5-6 tests):
```php
class MenuControllerTest extends TestCase {
    public function test_can_list_menus() { }
    public function test_can_create_menu() { }
    public function test_can_update_menu() { }
    public function test_can_delete_menu() { }
    public function test_permission_required_create() { }
    public function test_org_scoping() { }
}
```

---

### Paso 3: Create FeedControllerTest
**Archivo**: `backend/tests/Feature/Feeds/FeedControllerTest.php`

**Key tests**:
```php
class FeedControllerTest extends TestCase {
    public function test_can_list_feed_activities() { }
    public function test_feed_pagination_works() { }
    public function test_feed_filtered_by_user_org() { }
    public function test_permission_required() { }
}
```

---

### Paso 4: Create RoleControllerTest
**Archivo**: `backend/tests/Feature/Roles/RoleControllerTest.php`

**Key tests**:
```php
class RoleControllerTest extends TestCase {
    public function test_can_list_roles() { }
    public function test_admin_can_sync_permissions() { }
    public function test_non_admin_cannot_sync_permissions() { }
    public function test_cannot_modify_system_roles() { }
}
```

---

### Paso 5: Create UserControllerTest
**Archivo**: `backend/tests/Feature/Users/UserControllerTest.php`

**Key tests**:
```php
class UserControllerTest extends TestCase {
    public function test_can_list_users() { }
    public function test_can_create_user() { }
    public function test_can_update_own_profile() { }
    public function test_cannot_update_others_profile() { }
    public function test_password_validation_required() { }
    public function test_user_org_scoped_correctly() { }
}
```

---

### Paso 6: Run All Tests
**Terminal**:
```bash
# Test all 5 suites
php artisan test tests/Feature/Comments/
php artisan test tests/Feature/Menus/
php artisan test tests/Feature/Feeds/
php artisan test tests/Feature/Roles/
php artisan test tests/Feature/Users/

# Or run all together
php artisan test --filter "Comment|Menu|Feed|Role|User"

# Generate coverage report
php artisan test --coverage --min=85
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] 5 new test files created in `backend/tests/Feature/`
- [ ] Minimum 5-6 tests per controller (CRUD + permissions)
- [ ] All tests PASS: `php artisan test`
- [ ] Coverage >= 85% for these 5 controllers
- [ ] Each test has clear assertion (not just checking status code)
- [ ] Permission tests included (auth + authorization)
- [ ] Org scoping tests included (if multitenant applicable)

---

## 🧪 VERIFICACIÓN

```bash
# 1. Run all tests
php artisan test

# 2. Check coverage
php artisan test --coverage

# 3. Specific controller tests
php artisan test tests/Feature/Comments/CommentControllerTest.php --verbose

# 4. List all tests
php artisan test --list
```

---

## 📝 NOTAS

- **Test structure**: Arrange → Act → Assert pattern
- **RefreshDatabase trait**: Automatically migrates + rolls back per test
- **Factory usage**: User::factory(), Comment::factory(), etc.
- **Assertions**: assertStatus(), assertDatabaseHas(), assertEquals()
- **Org scoping**: TODO until multitenant finalized

---

## 🔗 REFERENCIAS

- Laravel Testing: https://laravel.com/docs/11.x/testing
- PHPUnit: https://phpunit.de/
- Factories: https://laravel.com/docs/11.x/eloquent-factories

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Alisson  
**Fecha inicio**: 2026-07-14  
**Fecha fin estimada**: 2026-07-15 (1-2 days)

