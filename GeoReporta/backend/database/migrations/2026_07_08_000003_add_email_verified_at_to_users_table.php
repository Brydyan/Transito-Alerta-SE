<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `email_verified_at` to the users table.
 *
 * The Laravel default users migration ships with this column, but the
 * project's initial custom migration dropped it (likely an oversight).
 * The spec for the registro-y-google-auth change (R8, R9) requires the
 * column to distinguish "user created via /register, never confirmed"
 * from "user who has actually proved email ownership" — the join key
 * for the Google login link-or-create decision.
 *
 * Nullable timestamp; no default; no FK. Backfill: every existing user
 * already in the table gets `null`, which matches the current
 * RegisterService behavior (no email-verification flow yet, so every
 * pre-existing password account is technically unverified from the
 * spec's perspective — and they would NOT be linkable from a Google
 * login until they verify, by design).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('email_verified_at')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('email_verified_at');
        });
    }
};
