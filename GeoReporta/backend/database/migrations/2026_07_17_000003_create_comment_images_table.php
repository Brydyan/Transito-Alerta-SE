<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')
                ->constrained('comments')
                ->cascadeOnDelete();
            $table->string('url');
            $table->string('caption')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('comment_id', 'comment_images_comment_id_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_images');
    }
};
