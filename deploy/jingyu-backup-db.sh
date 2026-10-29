#!/usr/bin/env bash
# 鲸域 · SQLite 数据库在线热备（better-sqlite3 backup API，WAL 安全）
# /var/www/jingyu/server/data/jingyu.db -> /var/backups/jingyu/db-YYYYmmdd-HHMMSS.db
# 保留最近 KEEP 份；root:root 600
set -uo pipefail

APP_DIR="/var/www/jingyu/server"
DB_FILE="$APP_DIR/data/jingyu.db"
BACKUP_DIR="/var/backups/jingyu"
LOG_FILE="/var/log/jingyu-backup.log"
KEEP=14

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/db-$STAMP.db"

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"
exec >>"$LOG_FILE" 2>&1
log() { printf '%s [jingyu-backup-db] %s\n' "$(date -Is)" "$*"; }

log "===== start stamp=$STAMP src=$DB_FILE dst=$DEST ====="

if [ ! -f "$DB_FILE" ]; then log "ERROR 数据库不存在: $DB_FILE"; exit 1; fi

NODE_BIN="$(command -v node || echo /usr/bin/node)"
BSQ="$APP_DIR/node_modules/better-sqlite3"

set +e
"$NODE_BIN" -e '
const Database = require(process.argv[1]);
const src = process.argv[2], dest = process.argv[3];
const db = new Database(src, { readonly: true, fileMustExist: true });
db.backup(dest).then(function (r) {
  console.log("pages=" + r.totalPages);
  db.close();
  process.exit(0);
}).catch(function (e) { console.error("backup failed: " + (e && e.message)); process.exit(1); });
' "$BSQ" "$DB_FILE" "$DEST"
RC=$?
set -e

if [ "$RC" -ne 0 ]; then log "ERROR 备份失败 rc=$RC"; rm -f "$DEST"; exit "$RC"; fi

chown root:root "$DEST"
chmod 600 "$DEST"
SIZE="$(stat -c %s "$DEST")"
log "备份完成 path=$DEST bytes=$SIZE"

DELETED=0
while IFS= read -r OLD; do
  [ -z "$OLD" ] && continue
  rm -f -- "$OLD"
  DELETED=$((DELETED+1))
  log "删除旧备份 $OLD"
done < <(ls -1t "$BACKUP_DIR"/db-*.db 2>/dev/null | tail -n "+$((KEEP+1))" || true)

TOTAL="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.db' | wc -l | tr -d ' ')"
log "===== done 删除=$DELETED 现存=$TOTAL"
