<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('refresh_token_hash');
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->boolean('is_revoked')->default(false);
            $table->datetime('expires_at');
            $table->timestamps();

            $table->index('user_id');
            $table->index('is_revoked');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};
