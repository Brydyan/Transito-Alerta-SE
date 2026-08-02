<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Models;

use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Eloquent model for the `assignments` pivot table.
 *
 * The table is a many-to-many between incidents and users with a role
 * column (`assignment_role` ∈ {responsable, apoyo}). The legacy code
 * accessed rows via `DB::table('assignments')` directly inside the
 * service, but the `AssignmentController` now uses an Eloquent model
 * for two reasons:
 *
 *   1. **Authorization wiring**: `authorizeResource(Assignment::class,
 *      'assignment')` resolves the `{assignment}` route segment via
 *      route-model binding so that `AssignmentPolicy::view|delete`
 *      receive a real `Assignment` instance (rather than the controller
 *      being forced to load the row first and pass it explicitly).
 *
 *   2. **Single source of truth**: with an Eloquent model, the
 *      controller, the resource layer, and the policy all reference the
 *      same domain object — improves discoverability and keeps the
 *      service-layer pivot queries (which still hit `DB::table` for
 *      performance-critical writes) decoupled from the HTTP contract.
 *
 * The pivot's `id` is kept (composite uniqueness on
 * (incident_id, user_id) is enforced by the migration), and the
 * `assignment_role` column is exposed via direct access without a
 * dedicated Eloquent cast — `AssignmentRole::from()` callers handle
 * the string-to-enum conversion explicitly.
 */
class Assignment extends Model
{
    use SoftDeletes;

    protected $table = 'assignments';

    protected $fillable = [
        'incident_id',
        'user_id',
        'assignment_role',
    ];

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
