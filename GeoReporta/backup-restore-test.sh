#!/bin/bash
#
# Backup & Restore Test Script
# Validates database integrity after restore
#

set -e

DB="${1:-incidencias_db}"
DB_USER="${2:-user}"
DB_HOST="${3:-localhost}"
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
TEST_DB="${DB}_restored_$(date +%s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📦 Backup & Restore Test Suite${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# 1. CREATE BACKUP
echo -e "\n${YELLOW}📦 Creating backup...${NC}"
pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$DB" > "$BACKUP_FILE"
if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE} (${SIZE})${NC}"
else
    echo -e "${RED}❌ Backup failed${NC}"
    exit 1
fi

# 2. PREPARE TEST DATABASE
echo -e "\n${YELLOW}🗑️  Preparing test database...${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true
psql -U "$DB_USER" -h "$DB_HOST" -c "CREATE DATABASE $TEST_DB;"
echo -e "${GREEN}✅ Test database created: $TEST_DB${NC}"

# 3. RESTORE FROM BACKUP
echo -e "\n${YELLOW}📥 Restoring from backup...${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" < "$BACKUP_FILE"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Restore completed${NC}"
else
    echo -e "${RED}❌ Restore failed${NC}"
    psql -U "$DB_USER" -h "$DB_HOST" -c "DROP DATABASE IF EXISTS $TEST_DB;"
    exit 1
fi

# 4. VALIDATION
echo -e "\n${YELLOW}✅ Validating restore integrity...${NC}"

# 4.1 Table counts
echo -e "\n${YELLOW}📊 Table record counts:${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" << SQL
\echo '  Incidents:'
SELECT COUNT(*) FROM incidents;
\echo '  Locations:'
SELECT COUNT(*) FROM locations;
\echo '  Organizations:'
SELECT COUNT(*) FROM organizations;
\echo '  Users:'
SELECT COUNT(*) FROM users;
\echo '  Status History:'
SELECT COUNT(*) FROM status_history;
\echo '  Comments:'
SELECT COUNT(*) FROM comments;
SQL

# 4.2 FK Constraints
echo -e "\n${YELLOW}🔗 Foreign Key Constraints:${NC}"
FK_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" -t -c "
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
")
echo "  Found: $FK_COUNT FK constraints"
if [ "$FK_COUNT" -gt 10 ]; then
    echo -e "  ${GREEN}✅ FK constraints restored${NC}"
else
    echo -e "  ${RED}⚠️  Low FK count (expected >10)${NC}"
fi

# 4.3 Triggers
echo -e "\n${YELLOW}⚡ Database Triggers:${NC}"
TRIGGER_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" -t -c "
    SELECT COUNT(*) FROM information_schema.triggers
    WHERE trigger_schema = 'public';
")
echo "  Found: $TRIGGER_COUNT triggers"
if [ "$TRIGGER_COUNT" -ge 3 ]; then
    echo -e "  ${GREEN}✅ Triggers restored${NC}"
else
    echo -e "  ${RED}⚠️  Low trigger count (expected ≥3)${NC}"
fi

# 4.4 GIS Integrity
echo -e "\n${YELLOW}🗺️  GIS Geometry Validation:${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" << SQL
\echo '  NULL geometries:'
SELECT COUNT(*) FROM incidents WHERE geom IS NULL;
\echo '  Valid geometries:'
SELECT COUNT(*) FROM incidents WHERE ST_IsValid(geom) = true;
SQL

# 4.5 Indexes
echo -e "\n${YELLOW}📑 Database Indexes:${NC}"
INDEX_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -d "$TEST_DB" -t -c "
    SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('incidents', 'locations', 'status_history', 'comments');
")
echo "  Found: $INDEX_COUNT indexes"
if [ "$INDEX_COUNT" -gt 5 ]; then
    echo -e "  ${GREEN}✅ Indexes restored${NC}"
else
    echo -e "  ${YELLOW}⚠️  Low index count (may need optimization)${NC}"
fi

# 5. CLEANUP
echo -e "\n${YELLOW}🧹 Cleaning up test database...${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -c "DROP DATABASE $TEST_DB;"
echo -e "${GREEN}✅ Test database dropped${NC}"

# 6. SUMMARY
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Backup & Restore Test Completed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\n📦 Backup file: ${BACKUP_FILE}"
echo -e "📥 To restore: psql -U $DB_USER -d incidencias_db < $BACKUP_FILE"
echo ""