#!/bin/sh
# midcine — daily backup of data/ (studies + patients + reports + DICOMs + audit + waitlist)
# Meant to run inside the bridge container via cron.
#
# Behavior:
#  - Creates a timestamped tar.gz in $BACKUP_DIR
#  - Keeps last $KEEP_LAST backups, prunes older
#  - Logs to stdout (docker logs captures it)
#
# Env:
#   MIDCINE_DATA_DIR    (default /data)
#   BACKUP_DIR          (default /backups)
#   KEEP_LAST           (default 14)

set -eu

DATA_DIR="${MIDCINE_DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_LAST="${KEEP_LAST:-14}"

mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/midcine-$TS.tar.gz"

echo "[$(date -u +%FT%TZ)] Backing up $DATA_DIR → $OUT"

if [ ! -d "$DATA_DIR" ]; then
  echo "  data dir missing, nothing to back up"
  exit 0
fi

# Exclude tmp/lock files
tar -czf "$OUT" \
  --exclude='*.tmp' \
  --exclude='*.lock' \
  -C "$(dirname "$DATA_DIR")" \
  "$(basename "$DATA_DIR")"

echo "  done ($(du -h "$OUT" | cut -f1))"

# Prune oldest beyond KEEP_LAST
ls -1t "$BACKUP_DIR"/midcine-*.tar.gz 2>/dev/null | tail -n +"$((KEEP_LAST + 1))" | while read -r old; do
  echo "  pruning old backup $old"
  rm -f "$old"
done

echo "[$(date -u +%FT%TZ)] Backup finished"
