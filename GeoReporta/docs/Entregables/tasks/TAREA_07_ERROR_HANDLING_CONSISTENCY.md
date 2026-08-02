# 📋 TAREA 07 — Error Handling Consistency

**Asignado a**: Integrante Backend (Yandris)  
**Prioridad**: 🟡 ALTA  
**Estimado**: 2-3 horas  
**Dificultad**: Fácil-Media  
**Sprint**: THIS WEEK  

---

## 📌 DESCRIPCIÓN

Error handling inconsistent across services/repositories:
- Some methods throw exceptions → logged
- Some methods return null silently → no error tracking
- Some methods fail with generic 500 error
- Inconsistent logging format

**Objetivo**: Standardize error handling; all exceptions logged with context.

---

## 🎯 IMPACTO

- **Before**: Silent failures possible; hard to debug production issues
- **After**: All errors logged with context; traceable error path
- **Gain**: Faster incident response; better observability

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Step 1: Audit Current Error Handling
**Search for**:
```bash
# Find all try-catch blocks
grep -r "try {" backend/app/Domains --include="*.php" | wc -l

# Find all catch blocks
grep -r "catch" backend/app/Domains --include="*.php" | head -20

# Find methods returning null silently
grep -r "return null" backend/app/Domains --include="*.php" | head -20
```

---

### Step 2: Create Custom Exception Class
**File**: `backend/app/Exceptions/ServiceException.php` (create new)

```php
<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class ServiceException extends Exception
{
    protected $statusCode;
    protected $context;
    
    public function __construct($message, $statusCode = 400, $context = [])
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->context = $context;
    }
    
    public function render($request): JsonResponse
    {
        return response()->json([
            'message' => $this->message,
            'error_code' => $this->code,
            'context' => config('app.debug') ? $this->context : null, // Only in debug
        ], $this->statusCode);
    }
    
    public function report(): void
    {
        \Log::error('ServiceException: ' . $this->message, [
            'code' => $this->code,
            'context' => $this->context,
            'trace' => $this->getTraceAsString(),
        ]);
    }
}
```

---

### Step 3: Create Standardized Error Handling in Services

**Example**: `ClaimIncidentService.php`

**Before (BAD)**:
```php
public function claim($incidentId, $userId)
{
    $incident = Incident::find($incidentId);
    if (!$incident) {
        return null;  // ← Silent failure!
    }
    
    $user = User::find($userId);
    
    try {
        // Claim logic
    } catch (Exception $e) {
        // Not logged!
        throw $e;
    }
}
```

**After (GOOD)**:
```php
public function claim($incidentId, $userId)
{
    try {
        $incident = Incident::find($incidentId);
        if (!$incident) {
            throw new ServiceException(
                "Incidencia {$incidentId} no encontrada",
                Response::HTTP_NOT_FOUND,
                ['incident_id' => $incidentId]
            );
        }
        
        $user = User::find($userId);
        if (!$user) {
            throw new ServiceException(
                "Usuario {$userId} no encontrado",
                Response::HTTP_NOT_FOUND,
                ['user_id' => $userId]
            );
        }
        
        // Claim logic
        return $this->claimRepository->create([
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'claimed_at' => now(),
        ]);
        
    } catch (ServiceException $e) {
        throw $e; // Re-throw (already logged)
    } catch (Exception $e) {
        \Log::error('Unexpected error in claim()', [
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString(),
        ]);
        
        throw new ServiceException(
            'Error al asignar incidencia',
            Response::HTTP_INTERNAL_SERVER_ERROR,
            ['original_error' => $e->getMessage()]
        );
    }
}
```

---

### Step 4: Standardize Repository Error Handling

**Example**: `EloquentAssignmentRepository.php`

**Before (BAD)**:
```php
public function create(array $data)
{
    return Assignment::create($data);  // ← Throws but no context
}
```

**After (GOOD)**:
```php
public function create(array $data)
{
    try {
        $assignment = Assignment::create($data);
        \Log::info('Assignment created', ['assignment_id' => $assignment->id]);
        return $assignment;
    } catch (\Illuminate\Database\QueryException $e) {
        \Log::error('Database error creating assignment', [
            'data' => $data,
            'error' => $e->getMessage(),
        ]);
        
        throw new ServiceException(
            'Error al crear asignación',
            Response::HTTP_INTERNAL_SERVER_ERROR,
            ['db_error' => $e->getMessage()]
        );
    }
}
```

---

### Step 5: Fix Specific Silent Failures

**Find and fix** in these files:

1. **IncidentService.php**
   - Search: `return null`
   - Fix: Throw ServiceException instead

2. **CommentService.php**
   - Search: Unmarked delete operations
   - Fix: Log success/failure

3. **StatusHistoryService.php**
   - Search: State transitions without error handling
   - Fix: Validate state + throw if invalid

4. **NotificationService.php**
   - Search: Queue operations
   - Fix: Log if job fails to queue

---

### Step 6: Add Logging Context to all Catch Blocks

**Pattern**:
```php
catch (Exception $e) {
    \Log::error('Error in method()', [
        'parameter_1' => $param1,  // Relevant context
        'parameter_2' => $param2,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString(),  // Full stack trace
    ]);
    
    // Either re-throw or convert to user-friendly error
    throw new ServiceException(
        'User-friendly message',
        Response::HTTP_INTERNAL_SERVER_ERROR
    );
}
```

---

### Step 7: Test Error Paths
**File**: `backend/tests/Feature/ErrorHandlingTest.php` (create new)

```php
<?php

namespace Tests\Feature;

use App\Exceptions\ServiceException;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ErrorHandlingTest extends TestCase
{
    use RefreshDatabase;
    
    public function test_claim_nonexistent_incident_throws_not_found()
    {
        $user = User::factory()->create();
        
        $this->expectException(ServiceException::class);
        
        $claimService = app(\App\Domains\Incidents\Services\ClaimIncidentService::class);
        $claimService->claim(9999, $user->id);
    }
    
    public function test_create_assignment_invalid_data_throws_error()
    {
        $this->expectException(ServiceException::class);
        
        $assignmentService = app(\App\Domains\Assignments\Services\AssignmentService::class);
        $assignmentService->create([
            'incident_id' => 9999,  // Non-existent
            'user_id' => 9999,      // Non-existent
            'role' => 'responsable',
        ]);
    }
    
    public function test_errors_are_logged()
    {
        \Log::spy();
        
        try {
            $claimService = app(\App\Domains\Incidents\Services\ClaimIncidentService::class);
            $claimService->claim(9999, 9999);
        } catch (ServiceException $e) {
            // Expected
        }
        
        \Log::shouldHaveReceived('error')->once();
    }
}
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] ServiceException class created with standardized format
- [ ] All services wrap methods in try-catch with logging
- [ ] No silent failures (null returns without logging)
- [ ] All exceptions include context (relevant IDs, data)
- [ ] Logging format consistent across all catch blocks
- [ ] Error tests pass: `php artisan test ErrorHandlingTest`
- [ ] Production logs show meaningful error messages
- [ ] No regressions in existing endpoints

---

## 🧪 VERIFICATION

```bash
# 1. Search for remaining null returns
grep -r "return null" backend/app/Domains --include="*.php" | grep -v "test"

# 2. Search for bare throw without logging
grep -r "throw" backend/app --include="*.php" | grep -v "Log"

# 3. Run error handling tests
php artisan test tests/Feature/ErrorHandlingTest.php

# 4. Check logs for error patterns
tail -f storage/logs/laravel.log | grep "ServiceException"
```

---

## 📝 NOTAS

- **ServiceException** centralized error format
- **Context fields** should include IDs + relevant data
- **Logging always before re-throw** (in catch block)
- **Production**: Set `app.debug=false` to hide internal errors from users

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Yandris  
**Fecha inicio**: 2026-07-15  
**Fecha fin estimada**: 2026-07-16

