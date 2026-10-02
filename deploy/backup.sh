#!/bin/sh
# Daily database backup, run by crond in the "backup" service (docker-compose.prod.yml).
# Keeps the 7 newest daily dumps and, from Sundays, the 4 newest weekly ones.
# Connection comes from PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
set -eu

dir=/backups
mkdir -p "$dir/daily" "$dir/weekly"
stamp=$(date -u +%Y-%m-%dT%H%MZ)
file="$dir/daily/taskapp-$stamp.dump"

# Write to a temporary name first, so a failed dump never looks like a good backup.
pg_dump --format=custom --no-owner --file="$file.partial"
mv "$file.partial" "$file"

if [ "$(date -u +%u)" = "7" ]; then
  cp "$file" "$dir/weekly/"
fi

ls -1t "$dir"/daily/*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f --
ls -1t "$dir"/weekly/*.dump 2>/dev/null | tail -n +5 | xargs -r rm -f --

echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
