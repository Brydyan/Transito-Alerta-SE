<?php

use Laravel\Octane\Contracts\OperationTerminated;
use Laravel\Octane\Events\RequestHandled;
use Laravel\Octane\Events\RequestReceived;
use Laravel\Octane\Events\RequestTerminated;
use Laravel\Octane\Events\TaskReceived;
use Laravel\Octane\Events\TaskTerminated;
use Laravel\Octane\Events\TickReceived;
use Laravel\Octane\Events\TickTerminated;
use Laravel\Octane\Events\WorkerErrorOccurred;
use Laravel\Octane\Events\WorkerStarting;
use Laravel\Octane\Events\WorkerStopping;
use Laravel\Octane\Listeners\CloseMonologHandlers;
use Laravel\Octane\Listeners\EnsureUploadedFilesAreValid;
use Laravel\Octane\Listeners\EnsureUploadedFilesCanBeMoved;
use Laravel\Octane\Listeners\FlushOnce;
use Laravel\Octane\Listeners\FlushTemporaryContainerInstances;
use Laravel\Octane\Listeners\ReportException;
use Laravel\Octane\Listeners\StopWorkerIfNecessary;
use Laravel\Octane\Octane;

return [

    /*
    |--------------------------------------------------------------------------
    | Octane Server
    |--------------------------------------------------------------------------
    |
    | Swoole is the project standard. StreamedResponse works natively under
    | Swoole (vendor/laravel/octane/src/Swoole/SwooleClient.php uses
    | ob_start() + $swooleResponse->write()) without the buffering bug that
    | affected FrankenPHP and the Generator-refactor-only nature of
    | RoadRunner. See Issue #102 for the migration decision log.
    |
    */

    'server' => env('OCTANE_SERVER', 'swoole'),

    /*
    |--------------------------------------------------------------------------
    | Force HTTPS
    |--------------------------------------------------------------------------
    */

    'https' => env('OCTANE_HTTPS', false),

    /*
    |--------------------------------------------------------------------------
    | Octane Listeners
    |--------------------------------------------------------------------------
    */

    'listeners' => [
        WorkerStarting::class => [
            EnsureUploadedFilesAreValid::class,
            EnsureUploadedFilesCanBeMoved::class,
        ],

        RequestReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
            ...Octane::prepareApplicationForNextRequest(),
        ],

        RequestHandled::class => [],

        RequestTerminated::class => [],

        TaskReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
        ],

        TaskTerminated::class => [],

        TickReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
        ],

        TickTerminated::class => [],

        OperationTerminated::class => [
            FlushOnce::class,
            FlushTemporaryContainerInstances::class,
        ],

        WorkerErrorOccurred::class => [
            ReportException::class,
            StopWorkerIfNecessary::class,
        ],

        WorkerStopping::class => [
            CloseMonologHandlers::class,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Warm / Flush Bindings
    |--------------------------------------------------------------------------
    */

    'warm' => [
        ...Octane::defaultServicesToWarm(),
    ],

    'flush' => [
        //
    ],

    /*
    |--------------------------------------------------------------------------
    | Garbage Collection Threshold
    |--------------------------------------------------------------------------
    */

    'garbage' => 50,

    /*
    |--------------------------------------------------------------------------
    | Maximum Execution Time
    |--------------------------------------------------------------------------
    */

    'max_execution_time' => 30,

    /*
    |--------------------------------------------------------------------------
    | Swoole-specific options
    |--------------------------------------------------------------------------
    |
    | Tuned for SSE-heavy workloads. The native notification bell (see
    | openspec/changes/eliminar-mercure-sse-nativo) holds one long-lived
    | connection per logged-in user. With ~2 replicas behind Cloudflare,
    | each replica should comfortably handle 10k-30k concurrent streams
    | on modest hardware (2 CPU / 4 GB). The values below are the
    | product of that envelope.
    |
    | `octane.php` is the single source of truth — the entrypoint.sh
    | deliberately no longer passes `--workers` / `--max-requests` /
    | `--task-workers` CLI flags, because CLI flags silently override
    | config. Tuning here ships uniformly to dev, CI, and prod.
    |
    */

    'swoole' => [
        'options' => [
            'enable_coroutine' => true,
            'open_http2_protocol' => false,
            'open_websocket_protocol' => false,
            // `worker_num` and `task_worker_num` are read by Octane at
            // boot. We resolve them via env when present (deterministic
            // in CI) and otherwise let Octane compute its own default
            // (cpu * 2 for worker_num, cpu for task_worker_num). Calling
            // `swoole_cpu_num()` here crashes environments without the
            // Swoole extension (like the test runner), so we leave the
            // resolution to Octane by omitting the keys when env is unset.
            'worker_num' => env('OCTANE_WORKER_NUM') !== null
                ? (int) env('OCTANE_WORKER_NUM')
                : (function_exists('swoole_cpu_num') ? swoole_cpu_num() * 2 : 4),
            'task_worker_num' => env('OCTANE_TASK_WORKER_NUM') !== null
                ? (int) env('OCTANE_TASK_WORKER_NUM')
                : (function_exists('swoole_cpu_num') ? swoole_cpu_num() : 2),
        ],
        // 10000 keeps SSE connections from churning while bounding the
        // memory exposure of long-lived worker processes. Higher values
        // trade stability for capacity; lower values force reconnects.
        'max_request' => 10000,
        'task_max_request' => 100,
        'watch' => false,
        'memory' => 256,
    ],

];
