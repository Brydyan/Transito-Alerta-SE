#!/bin/bash
set -e

# -------------------------------------------------------
# Wait for PostgresSQL to be ready (TCP poll, 30s timeout)
# -------------------------------------------------------
echo "Waiting for database connection at ${DB_HOST:-db}:${DB_PORT:-5432}..."

TIMEOUT=30
INTERVAL=1
ELAPSED=0

while ! php -r "
    \$sock = @fsockopen('${DB_HOST:-db}', ${DB_PORT:-5432}, \$errno, \$errstr, 1);
    if (\$sock) { fclose(\$sock); exit(0); }
    exit(1);
" 2>/dev/null; do
    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "ERROR: Database not reachable after ${TIMEOUT}s. Exiting."
        exit 1
    fi
    echo "  Database not ready yet... (${ELAPSED}s/${TIMEOUT}s)"
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo "Database is ready."

# -------------------------------------------------------
# Run migrations (non-blocking: warn on failure)
# -------------------------------------------------------
echo "Running migrations..."
php artisan migrate --force || echo "WARNING: Migrations failed. Continuing startup."

# -------------------------------------------------------
# Sync permission catalog and role grants (idempotent).
# Permissions are code-defined; the seeders are the source
# of truth and re-running them keeps every environment in
# sync. Manual grants for roles 1-5 are reset on purpose.
# -------------------------------------------------------
echo "Syncing permissions..."
php artisan db:seed --class=PermissionSeeder --force || echo "WARNING: Permission sync failed."
php artisan db:seed --class=RolePermissionSeeder --force || echo "WARNING: Role permission sync failed."

# -------------------------------------------------------
# Health checks — quick connectivity diagnostics
# -------------------------------------------------------
echo ""
echo "═══ Health Checks ═══"

echo -n "  Redis .......... "
php -r "
    try {
        \$r = new Redis();
        \$r->connect('${REDIS_HOST:-redis}', ${REDIS_PORT:-6379}, 2);
        if (!empty('${REDIS_PASSWORD:-}')) {
            \$r->auth('${REDIS_PASSWORD}');
        }
        \$info = \$r->info('server');
        echo 'Connected (v' . (\$info['redis_version'] ?? '?') . ')' . PHP_EOL;
    } catch (\Throwable \$e) {
        echo 'FAILED — ' . \$e->getMessage() . PHP_EOL;
    }
" 2>&1 || echo "FAILED"

echo -n "  Storage ....... "
if [ "${FILESYSTEM_STORAGE_DISK:-s3}" = "public" ]; then
    echo "Local disk (public)"
elif [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    php -r "
        require '/var/www/backend/vendor/autoload.php';
        try {
            \$s3 = new Aws\S3\S3Client([
                'version'     => 'latest',
                'region'      => '${AWS_DEFAULT_REGION:-us-east-1}',
                'endpoint'    => '${AWS_ENDPOINT}',
                'use_path_style_endpoint' => ${AWS_USE_PATH_STYLE_ENDPOINT:-true},
                'credentials' => ['key' => '${AWS_ACCESS_KEY_ID}', 'secret' => '${AWS_SECRET_ACCESS_KEY}'],
            ]);
            \$buckets = \$s3->listBuckets();
            \$exists = false;
            foreach (\$buckets['Buckets'] as \$b) {
                if (\$b['Name'] === '${AWS_BUCKET:-incidencias}') { \$exists = true; break; }
            }
            \$msg = \$exists ? 'Connected (bucket exists)' : 'Connected (bucket ready)';
            echo \$msg . PHP_EOL;
        } catch (\Throwable \$e) {
            echo 'FAILED — ' . \$e->getMessage() . PHP_EOL;
        }
    " 2>&1 || echo "FAILED"
else
    echo "SKIPPED (no credentials)"
fi

echo "═══════════════════"
echo ""

# -------------------------------------------------------
# Honor an overridden command (worker/scheduler containers
# pass `php artisan queue:work ...` / `schedule:work` via
# `command:` in deploy.yml). Without this, every container
# sharing this image would boot Octane regardless of the
# command override.
# -------------------------------------------------------
if [ "$#" -gt 0 ]; then
    echo "Starting: $*"
    exec "$@"
fi

# -------------------------------------------------------
# Start Octane (Swoole) — exec replaces shell process
# so signals (SIGTERM) reach Octane directly.
#
# We do NOT pass --workers / --max-requests / --task-workers here.
# Those CLI flags silently override `config/octane.php`, which would
# drift between dev (octane.php values), CI (also octane.php), and
# prod (CLI flags in this file). Making `octane.php` the single
# source of truth removes that footgun.
# -------------------------------------------------------
echo "Starting Octane (Swoole) on 0.0.0.0:8000..."
exec php artisan octane:swoole \
    --host=0.0.0.0 \
    --port=8000
