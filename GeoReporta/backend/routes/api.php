<?php

use App\Domains\Auth\Firebase\Http\Controllers\GoogleAuthController;
use App\Domains\Auth\Local\Http\Controllers\AuthController;
use App\Domains\Auth\Local\Http\Controllers\ForgotPasswordController;
use App\Domains\Auth\Local\Http\Controllers\RegisterController;
use App\Domains\Auth\Local\Http\Controllers\ResetPasswordController;
use App\Domains\Auth\Local\Http\Controllers\VerificationController;
use App\Domains\Comments\Http\CommentController;
use App\Domains\Comments\Http\CommentImageController;
use App\Domains\IncidentCategories\Http\IncidentCategoryController;
use App\Domains\Incidents\Http\Controllers\AssignmentController;
use App\Domains\Incidents\Http\ExportIncidenciasController;
use App\Domains\Incidents\Http\FeedController;
use App\Domains\Incidents\Http\IncidentController;
use App\Domains\Incidents\Http\IncidentStatsController;
use App\Domains\Incidents\Http\IncidentWeeklyStatsController;
use App\Domains\Incidents\Http\IncidentWorkflowController;
use App\Domains\Incidents\Http\MapFilterController;
use App\Domains\Invitations\Http\Controllers\InvitationAcceptController;
use App\Domains\Locations\Http\LocationCatalogController;
use App\Domains\Locations\Http\LocationController;
use App\Domains\Menus\Http\MenuController;
use App\Domains\Notifications\Http\NotificationController;
use App\Domains\Notifications\Http\NotificationStreamController;
use App\Domains\Organizations\Http\OrganizationController;
use App\Domains\Roles\Http\RoleController;
use App\Domains\Users\Http\OperatorDashboardController;
use App\Domains\Users\Http\OperatorLocationController;
use App\Domains\Users\Http\UserController;
use App\StatusHistory\Interfaces\StatusHistoryController;
use Illuminate\Support\Facades\Route;

// Public
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/refresh', [AuthController::class, 'refresh']);
Route::post('/register', [RegisterController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/google', [GoogleAuthController::class, 'login'])->middleware('throttle:google');
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Password recovery — public, rate-limited
Route::post('/forgot-password', [ForgotPasswordController::class, '__invoke'])
    ->middleware('throttle:5,1');
Route::post('/reset-password', [ResetPasswordController::class, '__invoke'])
    ->middleware('throttle:5,1');

// Invitation acceptance — public (no auth required), rate-limited
Route::post('/invitations/accept', [InvitationAcceptController::class, 'accept'])
    ->middleware('throttle:invitations');
// Preview of invitation metadata (org, inviter, role, expiry) without consuming it.
// Public: the token is opaque until consumed, but the caller may want to show
// the welcome context BEFORE the user types a password.
Route::get('/invitations/{token}/preview', [InvitationAcceptController::class, 'preview'])
    ->where('token', '[A-Za-z0-9_\-]+')
    ->middleware('throttle:invitations');

// Email verification — story sc-117 (OTP code verification)
Route::post('/email/verify-otp', [VerificationController::class, 'verifyOtp'])
    ->middleware('throttle:5,1');
Route::post('/email/resend', [VerificationController::class, 'resend'])
    ->middleware('throttle:5,1');

Route::middleware('jwt')->group(function () {

    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

    // Email verification — status + reenvío autenticados.
    Route::post('/email/resend', [VerificationController::class, 'resend'])
        ->middleware('throttle:email-verify');
    Route::get('/email/notice', [VerificationController::class, 'notice']);

    // Avatar handling is owned by PUT /users/{user} now (avatar file or
    // `_delete_avatar` flag in the same FormData/JSON payload) — see
    // UserController::update and UpdateUserRequest.

    // Operator tracking
    Route::post('/operator/location', [OperatorLocationController::class, 'update']);
    Route::get('/operator/locations', [OperatorLocationController::class, 'index']);
    Route::get('/operator/dashboard', OperatorDashboardController::class);

    // Core
    Route::get('incidents/stats', IncidentStatsController::class);
    Route::get('incidents/weekly-stats', IncidentWeeklyStatsController::class);
    Route::get('incidents/feed', FeedController::class)->middleware('throttle:feed');
    Route::get('incidents/exportar', ExportIncidenciasController::class);
    Route::post('incidents/{incident}/claim', [IncidentWorkflowController::class, 'claim'])->where('incident', '\d+')->middleware('can:claim,incident');
    Route::post('incidents/{incident}/release', [IncidentWorkflowController::class, 'release'])->where('incident', '\d+')->middleware('can:release,incident');
    Route::put('incidents/{incident}/estado', [IncidentController::class, 'updateStatus'])->where('incident', '\d+');
    Route::apiResource('incidents', IncidentController::class)->where(['incident' => '\d+']);
    Route::apiResource('incidents.comments', CommentController::class)->shallow();

    // Comment images (nested under comments for image CRUD) — inherits jwt group middleware
    Route::post('/comments/{comment}/images', [CommentImageController::class, 'store']);
    Route::delete('/comments/{comment}/images/{image}', [CommentImageController::class, 'destroy']);

    // `assignments` sub-resource (Phase 1 of historial-asignacion-operadores).
    // Explicit named routes instead of `apiResource` because we only expose
    // index/store/update/destroy — show is out of scope for this change.
    // Numeric constraints mirror the {incident} route param above so a
    // non-numeric {assignment} id surfaces as a route miss (404) rather than
    // a 500 from `abort(404)` on a string-coerced numeric column.
    Route::get('incidents/{incident}/assignments', [AssignmentController::class, 'index'])->whereNumber(['incident', 'assignment']);
    Route::post('incidents/{incident}/assignments', [AssignmentController::class, 'store'])->whereNumber('incident');
    Route::put('incidents/{incident}/assignments/{assignment}', [AssignmentController::class, 'update'])->whereNumber(['incident', 'assignment']);
    Route::delete('incidents/{incident}/assignments/{assignment}', [AssignmentController::class, 'destroy'])->whereNumber(['incident', 'assignment']);
    Route::get('incidents/{incident}/status-history', [StatusHistoryController::class, 'index'])->where('incident', '\d+');
    Route::get('incidents/{incident}/available-operators', [IncidentController::class, 'availableOperators'])->whereNumber('incident');
    Route::get('estados', [StatusHistoryController::class, 'availableStatuses']);

    // Notificaciones
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::patch('notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::patch('notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('notifications/{notification}/approve', [NotificationController::class, 'approve'])
        ->whereNumber('notification');
    Route::post('notifications/{notification}/reject', [NotificationController::class, 'reject'])
        ->whereNumber('notification');
    // SSE stream for the notification bell. The `jwt` middleware already
    // supports a cookie-based access_token fallback because native
    // EventSource cannot set custom request headers.
    // @see openspec/changes/eliminar-mercure-sse-nativo (Fase 3)
    Route::get('notifications/stream', NotificationStreamController::class);

    // Catálogos
    Route::get('map/filters', MapFilterController::class);
    // Citizen catalog for the incident form cascade — registered BEFORE the
    // apiResource so `catalog` is not captured as a {location} route param.
    // Deliberately permissive (no locations.view requirement): every
    // authenticated role must be able to fill the create/edit form.
    Route::get('locations/catalog', LocationCatalogController::class);
    Route::apiResource('locations', LocationController::class);
    Route::get('organizations/tree', [OrganizationController::class, 'tree']);
    Route::get('organizations/form-data', [OrganizationController::class, 'formData']);
    Route::get('organizations/notified-for', [OrganizationController::class, 'notifiedFor']);
    Route::apiResource('organizations', OrganizationController::class);

    Route::get('incident-categories/tree', [IncidentCategoryController::class, 'tree']);
    Route::apiResource('incident-categories', IncidentCategoryController::class);
    Route::get('users/form-data', [UserController::class, 'formData']);
    Route::apiResource('users', UserController::class);

    // RBAC
    Route::apiResource('roles', RoleController::class);
    Route::put('roles/{role}/permissions', [RoleController::class, 'syncPermissions']);
    Route::get('permissions', [RoleController::class, 'availablePermissions']);
    Route::get('permissions/my', [RoleController::class, 'myPermissions']);
    Route::get('menus/my', [MenuController::class, 'myMenus']);
});
