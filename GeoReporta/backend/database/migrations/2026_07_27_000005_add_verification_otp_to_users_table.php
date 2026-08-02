<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('verification_otp', 64)->nullable()->after('email_verified_at');
            $table->timestamp('verification_otp_expires_at')->nullable()->after('verification_otp');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['verification_otp', 'verification_otp_expires_at']);
        });
    }
};
