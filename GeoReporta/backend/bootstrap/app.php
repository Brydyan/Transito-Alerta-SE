<?php

use App\Domains\Auth\Shared\Exceptions\AuthenticationException;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Exceptions\HttpExceptionReporter;
use App\Http\Middleware\InstrumentHttpRequests;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(SecurityHeaders::class);

        $middleware->trustProxies(at: [
            '10.0.0.0/8',
            '172.16.0.0/12',
            '192.168.0.0/16',
        ]);

        $middleware->alias([
            'jwt' => JwtAuthenticate::class,
        ]);

        $middleware->api(append: [
            InstrumentHttpRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        $exceptions->dontReport([
            AuthenticationException::class,
        ]);

        // Laravel 13's internalDontReport suppresses HttpException (and subclasses
        // such as NotFoundHttpException). REQ-007 S7.2 requires them to be logged,
        // so we explicitly un-ignore them.
        $exceptions->stopIgnoring([
            HttpException::class,
        ]);

        $exceptions->report(function (Throwable $e): void {
            app(HttpExceptionReporter::class)->report($e, request());
        });

        $exceptions->render(function (AccessDeniedHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'No tenés permiso para realizar esta acción.'], 403);
            }
        });

        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Recurso no encontrado.'], 404);
            }
        });

        $exceptions->render(function (RuntimeException $e, Request $request) {
            if ($e instanceof HttpExceptionInterface) {
                return null;
            }
            if ($request->is('api/*')) {
                $code = $e->getCode();
                // PDOException/QueryException::getCode() returns the SQLSTATE
                // as a string (e.g. "42P01"), not an HTTP status. Only treat
                // the code as a status when it's genuinely an int in range —
                // otherwise a DB-level error crashes with a TypeError instead
                // of a clean 500 (found running CP-02-03-B / CP-04-04-B).
                $status = (is_int($code) && $code >= 400 && $code < 600) ? $code : 500;

                return response()->json(['message' => $e->getMessage()], $status);
            }
        });
    })->create();
