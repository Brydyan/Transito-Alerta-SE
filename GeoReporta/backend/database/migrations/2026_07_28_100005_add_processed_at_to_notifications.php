<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add `processed_at` nullable timestamp to the `notifications` table.
 *
 * Supports the admin-approval notification workflow (sc-123): the observer
 * sets `processed_at` when the notification has been dispatched to the admin,
 * allowing the query side to distinguish between "pending" and "processed"
 * notifications without re-reading the full notification payload.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->timestamp('processed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->dropColumn('processed_at');
        });
    }
};
