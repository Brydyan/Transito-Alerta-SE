<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Http;

use App\Domains\Incidents\Services\IncidentApprovalService;
use App\Domains\Notifications\Http\Requests\RejectNotificationRequest;
use App\Domains\Notifications\Http\Resources\NotificationResource;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class NotificationController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly NotificationService $service,
        private readonly IncidentApprovalService $approval,
    ) {}

    /**
     * Lista las notificaciones del usuario autenticado, paginadas.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => __('messages.unauthenticated')], 401);
        }

        $perPage = min((int) $request->integer('per_page', 20), 50);
        $page = max((int) $request->integer('page', 1), 1);

        $query = Notification::query()
            ->forUser($user)
            ->with('incident');

        if ($request->boolean('unread_only')) {
            $query->unread();
        }

        $notifications = $query->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => NotificationResource::collection($notifications->items())->resolve(),
            'meta' => [
                'total' => $notifications->total(),
                'per_page' => $notifications->perPage(),
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
            ],
            'unread_count' => Notification::query()->forUser($user)->unread()->count(),
        ]);
    }

    /**
     * Marca una notificación como leída (solo el dueño).
     */
    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        $this->authorize('markAsRead', $notification);

        if (! $notification->read) {
            $notification->update(['read' => true]);
        }

        return (new NotificationResource($notification->fresh('incident')))->response();
    }

    /**
     * Marca todas las notificaciones del usuario como leídas.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => __('messages.unauthenticated')], 401);
        }

        $count = $this->service->markAllAsRead($user);

        return response()->json([
            'updated' => $count,
            'unread_count' => 0,
        ]);
    }

    /**
     * Devuelve solo el conteo de no leídas (badge del header).
     * Admin scoped: admin_sistema global ve todas las incident_pending_approval;
     * admin_sistema org-scoped y admin_organizacion solo las de su org.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => __('messages.unauthenticated')], 401);
        }

        $query = Notification::query()
            ->forUser($user)
            ->unread();

        // Admin con organization_id=null es global — ve todas.
        // Admin org-scoped o admin_organizacion: incident_pending_approval filtrado por org.
        if (! $user->isSystemAdmin() || $user->organization_id !== null) {
            $query->where(function ($q) use ($user): void {
                /** @var Builder $q */
                $q->where('type', '!=', 'incident_pending_approval')
                    ->orWhereHas('incident', function ($iq) use ($user): void {
                        /** @var Builder $iq */
                        $iq->where('organization_id', $user->organization_id);
                    });
            });
        }

        return response()->json(['unread_count' => $query->count()]);
    }

    /**
     * Aprueba una notificación de tipo IncidentPendingApproval — cierra la incidencia.
     *
     * POST /notifications/{notification}/approve
     */
    public function approve(Request $request, Notification $notification): JsonResponse
    {
        abort_unless($request->user() !== null, 401);
        $this->authorize('approve', $notification);

        try {
            $this->approval->approve($notification, $request->user());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() ?: 409);
        }

        $notification->refresh();
        $notification->load('incident');

        return (new NotificationResource($notification))->response();
    }

    /**
     * Rechaza una notificación de tipo IncidentPendingApproval — vuelve la incidencia
     * a in_progress o pending según corresponda.
     *
     * POST /notifications/{notification}/reject
     */
    public function reject(RejectNotificationRequest $request, Notification $notification): JsonResponse
    {
        abort_unless($request->user() !== null, 401);
        $this->authorize('reject', $notification);

        try {
            $this->approval->reject($notification, $request->user(), $request->validated('reason'));
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() ?: 422);
        }

        $notification->refresh();
        $notification->load('incident');

        return (new NotificationResource($notification))->response();
    }
}
