<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Enums;

enum NotificationType: string
{
    case Claim = 'claim';
    case Assignment = 'assignment';
    case StatusChange = 'status_change';
    case Assigned = 'assigned';
    case Comment = 'comment';
    case Legacy = 'legacy';
    case IncidentPendingApproval = 'incident_pending_approval';
}
