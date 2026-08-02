<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Deduplicate children: now that roots are merged, children share parent_id
        do {
            $deleted = 0;

            $groups = DB::table('incident_categories')
                ->select('name', 'parent_id', DB::raw('MIN(id) as keep_id'))
                ->whereNull('deleted_at')
                ->groupBy('name', 'parent_id')
                ->having(DB::raw('COUNT(*)'), '>', 1)
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

                // Move pivot entries
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

                // Reassign grandchildren
                DB::table('incident_categories')
                    ->whereIn('parent_id', $removeIds)
                    ->update(['parent_id' => $group->keep_id]);

                // Delete duplicates
                $deleted += DB::table('incident_categories')
                    ->whereIn('id', $removeIds)
                    ->delete();
            }
        } while ($deleted > 0); // repeat until no more duplicates
    }

    public function down(): void
    {
        // No rollback – data is already consolidated
    }
};
