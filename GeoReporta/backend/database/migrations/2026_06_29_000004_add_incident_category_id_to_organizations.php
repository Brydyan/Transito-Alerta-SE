<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add nullable FK column
        Schema::table('organizations', function (Blueprint $table) {
            $table->foreignId('incident_category_id')
                ->nullable()
                ->after('parent_id')
                ->constrained('incident_categories')
                ->nullOnDelete();
        });

        // 2. Migrate existing pivot data: for each org, take the FIRST category
        DB::table('organizations')
            ->orderBy('id')
            ->chunk(100, function ($organizations) {
                foreach ($organizations as $org) {
                    $firstCategory = DB::table('category_organization')
                        ->where('organization_id', $org->id)
                        ->first();

                    if ($firstCategory) {
                        DB::table('organizations')
                            ->where('id', $org->id)
                            ->update(['incident_category_id' => $firstCategory->incident_category_id]);
                    }
                }
            });

        // 3. Drop pivot table
        Schema::dropIfExists('category_organization');
    }

    public function down(): void
    {
        // 1. Recreate pivot table
        Schema::create('category_organization', function (Blueprint $table) {
            $table->foreignId('incident_category_id')
                ->constrained('incident_categories')
                ->cascadeOnDelete();
            $table->foreignId('organization_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->primary(['incident_category_id', 'organization_id']);
        });

        // 2. Migrate orgs back to pivot
        DB::table('organizations')
            ->whereNotNull('incident_category_id')
            ->orderBy('id')
            ->chunk(100, function ($organizations) {
                foreach ($organizations as $org) {
                    DB::table('category_organization')->updateOrInsert(
                        [
                            'incident_category_id' => $org->incident_category_id,
                            'organization_id' => $org->id,
                        ],
                        [],
                    );
                }
            });

        // 3. Drop column
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('incident_category_id');
        });
    }
};
