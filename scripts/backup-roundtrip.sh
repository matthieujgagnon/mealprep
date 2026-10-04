#!/usr/bin/env bash
# Local proof that a backup can be restored: dump a database, encrypt it,
# decrypt it, restore it into a brand-new scratch database, and compare the
# row count of every table. Uses the same commands as
# .github/workflows/db-backup.yml and docs/backup-and-restore.md.
#
# Usage:  DATABASE_URL=postgresql://...local... scripts/backup-roundtrip.sh
# Only run it against a local/test database. It creates (and then drops) a
# scratch database named mealprep_restore_check next to the source one.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the local database to test}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: DATABASE_URL is not a local database." >&2; exit 1 ;;
esac

scratch_db=mealprep_restore_check
base="${DATABASE_URL%%\?*}"
query="${DATABASE_URL#"$base"}"
target_url="${base%/*}/$scratch_db$query"

work="$(mktemp -d)"
cleanup() {
  psql "$DATABASE_URL" -q -c "drop database if exists $scratch_db" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

passphrase="$(head -c 24 /dev/urandom | base64)"

echo "1. Dumping the source database"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$work/mealprep.dump"

echo "2. Encrypting it (gpg, AES-256, passphrase)"
printf '%s' "$passphrase" | gpg --batch --yes --quiet \
  --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 \
  --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --compress-algo none \
  --output "$work/mealprep.dump.gpg" "$work/mealprep.dump"
rm "$work/mealprep.dump"
echo "   dump + encrypted size: $(stat -c %s "$work/mealprep.dump.gpg") bytes (encrypted file)"

echo "3. Decrypting it"
printf '%s' "$passphrase" | gpg --batch --yes --quiet \
  --pinentry-mode loopback --passphrase-fd 0 \
  --output "$work/restored.dump" --decrypt "$work/mealprep.dump.gpg"

echo "4. Restoring into a new empty database"
psql "$DATABASE_URL" -q -c "drop database if exists $scratch_db" -c "create database $scratch_db"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target_url" "$work/restored.dump"

echo "5. Comparing row counts for every table"
count_sql="select string_agg(format('select %L as t, count(*) as n from %I.%I', tablename, schemaname, tablename), ' union all ' order by tablename)
           from pg_tables where schemaname = 'public'"
counts() {
  psql "$1" -Atq -c "$count_sql" | psql "$1" -Atq -f - | sort
}
counts "$DATABASE_URL" > "$work/source.counts"
counts "$target_url" > "$work/restored.counts"
tables="$(wc -l < "$work/source.counts")"
[ "$tables" -gt 0 ] || { echo "   No tables found in the source database." >&2; exit 1; }
if diff "$work/source.counts" "$work/restored.counts" >/dev/null; then
  echo "   OK: all $tables tables have matching row counts."
  awk -F'|' '$2 > 0 { printf "   %-24s %s rows\n", $1, $2 }' "$work/source.counts"
else
  echo "   MISMATCH between source and restored database:" >&2
  diff "$work/source.counts" "$work/restored.counts" >&2 || true
  exit 1
fi
