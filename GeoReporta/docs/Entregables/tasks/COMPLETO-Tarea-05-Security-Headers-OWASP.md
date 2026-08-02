# 📋 TAREA 05 — Security Headers Middleware

**Asignado a**: Integrante Backend (Andy)  
**Prioridad**: 🟡 ALTA  
**Estimado**: 2 horas  
**Dificultad**: Fácil  
**Sprint**: THIS WEEK  

---

## 📌 DESCRIPCIÓN

4 critical security headers missing from API responses:
- ❌ `X-Frame-Options` (clickjacking prevention)
- ❌ `X-Content-Type-Options` (MIME sniffing prevention)
- ❌ `Strict-Transport-Security` (HTTPS downgrade prevention)
- ❌ `Content-Security-Policy` (XSS framing prevention)

**Objective**: Add middleware to inject headers on all responses.

---

## 🎯 IMPACTO

- **Before**: Browser vulnerabilities (clickjacking, MIME sniffing)
- **After**: All responses include security headers
- **Gain**: OWASP Top 10 A04 (Insecure Design) mitigated

---

## 📁 FILES TO CREATE

```
backend/app/Http/Middleware/SecurityHeaders.php   (NEW)
```

---

## 🔧 IMPLEMENTATION STEPS

### Step 1: Create SecurityHeaders Middleware
**File**: `backend/app/Http/Middleware/SecurityHeaders.php` (create new)

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class SecurityHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     */
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        // Prevent clickjacking attacks
        $response->header('X-Frame-Options', 'DENY');

        // Prevent MIME sniffing
        $response->header('X-Content-Type-Options', 'nosniff');

        // Force HTTPS (1 year + subdomains)
        $response->header(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );

        // Content Security Policy
        $response->header(
            'Content-Security-Policy',
            "default-src 'self'; " .
            "script-src 'self' 'unsafe-inline' https://unpkg.com; " .
            "style-src 'self' 'unsafe-inline' https://unpkg.com; " .
            "img-src 'self' data: https:; " .
            "font-src 'self' data: https://unpkg.com; " .
            "connect-src 'self' http://localhost:8000; " .
            "frame-ancestors 'none';"
        );

        // Additional security headers
        $response->header('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        return $response;
    }
}
```

---

### Step 2: Register Middleware in Kernel
**File**: `backend/app/Http/Kernel.php`

**Find**: `protected $middleware = [` array

**Add**:
```php
protected $middleware = [
    // ... existing middleware ...
    \App\Http\Middleware\SecurityHeaders::class,  // ← ADD THIS
];
```

**Example**:
```php
protected $middleware = [
    \App\Http\Middleware\EncryptCookies::class,
    \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
    \Illuminate\Session\Middleware\StartSession::class,
    // ... other middleware ...
    \App\Http\Middleware\SecurityHeaders::class,  // ← ADD HERE
];
```

---

### Step 3: Test Headers are Present
**Terminal**:

```bash
# Test via curl
curl -I http://localhost:8000/api/incidents

# Output should include:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# Content-Security-Policy: default-src 'self'; ...
```

---

### Step 4: Verify via Browser DevTools

1. Open browser: `http://localhost:3000`
2. Open DevTools → Network tab
3. Click any request to backend
4. Check Response Headers tab
5. Should see all 4 headers present

---

### Step 5: Create Test for Headers
**File**: `backend/tests/Feature/SecurityHeadersTest.php` (create new)

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_x_frame_options_header_present()
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('X-Frame-Options'));
        $this->assertEquals('DENY', $response->headers->get('X-Frame-Options'));
    }

    public function test_x_content_type_options_header_present()
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('X-Content-Type-Options'));
        $this->assertEquals('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    public function test_strict_transport_security_header_present()
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Strict-Transport-Security'));
        $this->assertStringContainsString('max-age=31536000', 
            $response->headers->get('Strict-Transport-Security')
        );
    }

    public function test_content_security_policy_header_present()
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Content-Security-Policy'));
        $this->assertStringContainsString("default-src 'self'", 
            $response->headers->get('Content-Security-Policy')
        );
    }

    public function test_all_endpoints_have_security_headers()
    {
        $endpoints = [
            '/api/incidents',
            '/api/incidents/stats',
            '/api/locations/tree',
        ];

        foreach ($endpoints as $endpoint) {
            $response = $this->get($endpoint);
            $this->assertTrue($response->headers->has('X-Frame-Options'),
                "Missing X-Frame-Options on {$endpoint}");
            $this->assertTrue($response->headers->has('X-Content-Type-Options'),
                "Missing X-Content-Type-Options on {$endpoint}");
        }
    }
}
```

**Run test**:
```bash
php artisan test tests/Feature/SecurityHeadersTest.php
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] SecurityHeaders middleware class created
- [ ] Middleware registered in `app/Http/Kernel.php`
- [ ] All 4 headers present on ALL API responses (verify via curl)
- [ ] Headers visible in browser DevTools
- [ ] Unit tests pass: `php artisan test SecurityHeadersTest`
- [ ] No errors in Laravel logs after adding middleware
- [ ] CSP policy doesn't break frontend requests

---

## 🧪 VERIFICATION

```bash
# 1. Check headers via curl
curl -I http://localhost:8000/api/incidents | grep -i "X-Frame\|X-Content\|Strict-Transport\|CSP"

# Output example:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# Content-Security-Policy: default-src 'self'; ...

# 2. Run tests
php artisan test tests/Feature/SecurityHeadersTest.php

# 3. Verify no regressions
php artisan test

# 4. Browser DevTools verification
# Navigate to http://localhost:3000 → DevTools → Network → Click request → Response Headers
```

---

## 📝 NOTES

- **CSP Policy**: May need adjustment if frontend uses external CDNs (adjust `script-src` if needed)
- **HSTS**: Browsers cache for 1 year; only enable after testing
- **Middleware order**: Should be early in chain (before response processing)
- **Production**: Consider adding `HSTS: preload` for HSTS Preload List

---

## 🔗 REFERENCES

- OWASP Security Headers: https://owasp.org/www-project-secure-headers/
- MDN X-Frame-Options: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
- CSP Guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- Laravel Middleware: https://laravel.com/docs/11.x/middleware

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Andy  
**Fecha inicio**: 2026-07-15  
**Fecha fin estimada**: 2026-07-15 (same day)

