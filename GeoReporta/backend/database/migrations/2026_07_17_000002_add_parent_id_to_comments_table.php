<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comments', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->after('user_id')
                ->constrained('comments')
                ->cascadeOnDelete();

            $table->index('parent_id', 'comments_parent_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('comments', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropIndex('comments_parent_id_index');
            $table->dropColumn('parent_id');
        });
    }
};
