<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // CSP connect-src: separate by environment
        // Prod: EventSource uses relative URL (/.well-known/mercure), proxied by nginx
        //       Only 'self' + WebSocket protocols needed
        // Dev:  EventSource may hit localhost:8000 (cross-origin dev setup)
        $connectSrc = app()->environment('production')
            ? "'self' wss: ws:"
            : "'self' http://localhost:8000 http://localhost:3000 ws: wss:";

        $headers = [
            'X-Frame-Options' => 'DENY',
            'X-Content-Type-Options' => 'nosniff',
            'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains; preload',
            'Content-Security-Policy' => "default-src 'self'; ".
                "script-src 'self' 'unsafe-inline' https://unpkg.com; ".
                "style-src 'self' 'unsafe-inline' https://unpkg.com; ".
                "img-src 'self' data: https:; ".
                "font-src 'self' data: https://unpkg.com; ".
                "connect-src {$connectSrc}; ".
                "frame-ancestors 'none';",
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()',
        ];

        foreach ($headers as $key => $value) {
            if ($response instanceof StreamedResponse) {
                $response->headers->set($key, $value);
            } else {
                $response->header($key, $value);
            }
        }

        return $response;
    }
}
