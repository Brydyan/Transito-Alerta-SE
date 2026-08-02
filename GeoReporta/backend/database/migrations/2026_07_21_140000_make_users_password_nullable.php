<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Makes users.password nullable so admin-created users can be born with
     * password=null (pending invitation acceptance).
     *
     * PostgreSQL: ALTER COLUMN syntax.
     * SQLite: recreate table via Schema::table + ->change() requires doctrine/dbal.
     *         Without dbal, we rebuild the table manually for SQLite.
     */
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
        } elseif ($driver === 'sqlite') {
            $this->rebuildTableForSqlite();
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE users ALTER COLUMN password SET NOT NULL');
        } elseif ($driver === 'sqlite') {
            $this->rebuildTableForSqliteRevert();
        }
    }

    /**
     * Rebuild users table to make password nullable (SQLite).
     *
     * SQLite does not support ALTER COLUMN ... DROP NOT NULL.
     * Workaround: recreate the table preserving all existing columns plus the
     * nullable password column.
     */
    private function rebuildTableForSqlite(): void
    {
        // 1. Create new table with password nullable, preserving ALL existing columns.
        //    SQLite does not have a "COPY" equivalent, so we must manually list
        //    every column. This matches the full schema up to this migration point.
        Schema::create('users_temp', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->string('email')->unique();
            $table->string('password')->nullable(); // <-- nullable (the only change)
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable();
            $table->jsonb('avatar')->nullable();
            $table->string('profile_image_path')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('terms_version', 10)->default('v0');
            $table->timestamp('terms_accepted_at')->nullable();
            $table->integer('organization_id')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // 2. Copy ALL data from old table
        DB::statement('
            INSERT INTO users_temp (id, role_id, email, password, first_name, last_name, phone, avatar, profile_image_path, email_verified_at, terms_version, terms_accepted_at, organization_id, created_at, updated_at, deleted_at)
            SELECT id, role_id, email, password, first_name, last_name, phone, avatar, profile_image_path, email_verified_at, terms_version, terms_accepted_at, organization_id, created_at, updated_at, deleted_at FROM users
        ');

        // 3. Drop old table
        Schema::drop('users');

        // 4. Rename new table
        Schema::rename('users_temp', 'users');

        // 5. Restore unique email index
        Schema::table('users', function (Blueprint $table): void {
            $table->unique('email');
        });
    }

    /**
     * Restore users.password to NOT NULL (SQLite revert).
     */
    private function rebuildTableForSqliteRevert(): void
    {
        Schema::create('users_temp', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->string('email')->unique();
            $table->string('password'); // NOT NULL (reverted)
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable();
            $table->jsonb('avatar')->nullable();
            $table->string('profile_image_path')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('terms_version', 10)->default('v0');
            $table->timestamp('terms_accepted_at')->nullable();
            $table->integer('organization_id')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        DB::statement('
            INSERT INTO users_temp (id, role_id, email, password, first_name, last_name, phone, avatar, profile_image_path, email_verified_at, terms_version, terms_accepted_at, organization_id, created_at, updated_at, deleted_at)
            SELECT id, role_id, email, password, first_name, last_name, phone, avatar, profile_image_path, email_verified_at, terms_version, terms_accepted_at, organization_id, created_at, updated_at, deleted_at FROM users
        ');

        Schema::drop('users');
        Schema::rename('users_temp', 'users');

        Schema::table('users', function (Blueprint $table): void {
            $table->unique('email');
        });
    }
};
