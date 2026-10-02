#!/bin/sh
# Restore a backup made by backup.sh. Run inside the backup service, with the backend stopped:
#
#   docker compose -f docker-compose.prod.yml stop backend
#   docker compose -f docker-compose.prod.yml exec backup sh /scripts/restore.sh /backups/daily/<file>.dump
#   docker compose -f docker-compose.prod.yml start backend
#
# Replaces the current database contents with the backup's.
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "usage: restore.sh /backups/daily/<file>.dump" >&2
  echo "available backups (newest first):" >&2
  found=$(ls -1t /backups/daily/*.dump /backups/weekly/*.dump 2>/dev/null || true)
  echo "${found:-  (none)}" >&2
  exit 1
fi

echo "Restoring $file into database '$PGDATABASE'..."
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE" "$file"
echo "Restore complete."
