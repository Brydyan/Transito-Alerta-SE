<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Create pivot table
        Schema::create('category_organization', function (Blueprint $table) {
            $table->foreignId('incident_category_id')
                ->constrained('incident_categories')
                ->cascadeOnDelete();
            $table->foreignId('organization_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->primary(['incident_category_id', 'organization_id']);
        });

        // 2. Migrate all current org assignments to pivot
        DB::table('incident_categories')
            ->orderBy('id')
            ->chunk(100, function ($categories) {
                $inserts = [];
                foreach ($categories as $cat) {
                    $inserts[] = [
                        'incident_category_id' => $cat->id,
                        'organization_id' => $cat->organization_id,
                    ];
                }
                DB::table('category_organization')->insert($inserts);
            });

        // 3. Remove organization_id FK and column
        Schema::table('incident_categories', function (Blueprint $table) {
            $table->dropForeign(['organization_id']);
            $table->dropColumn('organization_id');
        });

        // 4. Deduplicate: merge categories with same (name, parent_id)
        $groups = DB::table('incident_categories')
            ->select('name', 'parent_id', DB::raw('MIN(id) as keep_id'))
            ->whereNull('deleted_at')
            ->groupBy('name', 'parent_id')
            ->get();

        foreach ($groups as $group) {
            $removeIds = DB::table('incident_categories')
                ->where('name', $group->name)
                ->where('parent_id', $group->parent_id)
                ->where('id', '!=', $group->keep_id)
                ->whereNull('deleted_at')
                ->pluck('id')
                ->toArray();

            if (empty($removeIds)) {
                continue;
            }

            // Move pivot entries from removed IDs to kept ID
            $orgIdsToMove = DB::table('category_organization')
                ->whereIn('incident_category_id', $removeIds)
                ->pluck('organization_id');

            foreach ($orgIdsToMove as $orgId) {
                DB::table('category_organization')->updateOrInsert(
                    ['incident_category_id' => $group->keep_id, 'organization_id' => $orgId],
                    [],
                );
            }

            DB::table('category_organization')
                ->whereIn('incident_category_id', $removeIds)
                ->delete();

            // Reassign incidents
            DB::table('incidents')
                ->whereIn('incident_category_id', $removeIds)
                ->update(['incident_category_id' => $group->keep_id]);

            // Reassign subcategories
            DB::table('incident_categories')
                ->whereIn('parent_id', $removeIds)
                ->update(['parent_id' => $group->keep_id]);

            // Delete duplicates
            DB::table('incident_categories')
                ->whereIn('id', $removeIds)
                ->delete();
        }
    }

    public function down(): void
    {
        // Restore organization_id column
        Schema::table('incident_categories', function (Blueprint $table) {
            $table->foreignId('organization_id')
                ->nullable()
                ->after('id')
                ->constrained()
                ->nullOnDelete();
        });

        // Restore org assignments from pivot (pick first org per category)
        DB::table('incident_categories')
            ->orderBy('id')
            ->chunk(100, function ($categories) {
                foreach ($categories as $cat) {
                    $firstOrg = DB::table('category_organization')
                        ->where('incident_category_id', $cat->id)
                        ->first();
                    if ($firstOrg) {
                        DB::table('incident_categories')
                            ->where('id', $cat->id)
                            ->update(['organization_id' => $firstOrg->organization_id]);
                    }
                }
            });

        Schema::dropIfExists('category_organization');
    }
};
