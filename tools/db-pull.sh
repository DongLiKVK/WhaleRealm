#!/usr/bin/env bash
#
# 鲸域 · 从唯一写入源单向拉取生产库快照到本地
#
# 铁律：这个脚本只有「拉」没有「推」。
#   本地永远不能把库写回生产 —— 要改数据只能通过生产站的 HTTP API 或 /admin 后台。
#   需要在本机复现线上问题？拉一份快照到 .tmp/pull/，用 DB_PATH 指过去跑，别动 server/data/jingyu.dev.db。
#
# 为什么默认 lite：
#   2026-10-26 插件文档迁入境外后，生产库从 8.6MB 涨到 300MB，其中 294MB 是 readme 缓存。
#   复现业务问题用不到那部分，全量拉一次 20 分钟且长连接容易断。lite 只搬业务表，约 8MB、半分钟。
#   真需要连缓存一起（比如调插件页渲染），用 --full。
#
# 用法：
#   bash tools/db-pull.sh                 # lite 快照（排除 plugin_readmes / plugin_readme_docs）
#   bash tools/db-pull.sh --full          # 全量 300MB（直连 + 分块，慢）
#   bash tools/db-pull.sh --keep 5        # 只保留最近 5 份本地快照
#
# 传输方式：默认直连境外 158.247.215.153（本地可达）。走境内跳板传大文件会在 3m37s 被断。
#   想强制走跳板：DIRECT=0 bash tools/db-pull.sh
set -euo pipefail

SSH_CONFIG="${SSH_CONFIG:-$HOME/.ssh/config_whale}"
ALIAS="${ALIAS:-whale}"
DIRECT="${DIRECT:-1}"
REMOTE_APP="/var/www/jingyu/server"
MODE="lite"
KEEP=10
while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) MODE="full"; shift ;;
    --lite) MODE="lite"; shift ;;
    --keep) KEEP="${2:-10}"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ "$DIRECT" == "1" ]]; then
  SSH_OPTS=(-i "$HOME/.ssh/jingyu_ed25519" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
  TARGET="root@158.247.215.153"
else
  SSH_OPTS=(-F "$SSH_CONFIG" -o LogLevel=ERROR)
  TARGET="$ALIAS"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTDIR="$ROOT/.tmp/pull"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUTDIR/jingyu-prod-$STAMP.db"

step() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

mkdir -p "$OUTDIR"

if [[ "$MODE" == "lite" ]]; then
  step "远端生成 lite 快照（排除 plugin_readmes / plugin_readme_docs）"
  ssh "${SSH_OPTS[@]}" "$TARGET" 'sudo bash -s' <<'EOS'
set -euo pipefail
APP=/var/www/jingyu/server
OUT=/var/backups/jingyu/pull-lite.db
cd "$APP"
rm -f "$OUT" "$OUT-wal" "$OUT-shm"
node -e '
const D = require("./node_modules/better-sqlite3");
const EXCLUDE = new Set(["plugin_readmes", "plugin_readme_docs"]);
const src = new D("data/jingyu.db", { readonly: true, fileMustExist: true });
const dst = new D("/var/backups/jingyu/pull-lite.db");
dst.pragma("journal_mode = DELETE");
dst.pragma("foreign_keys = OFF");
const objs = src.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL").all();
for (const o of objs) {
  if (EXCLUDE.has(o.name) || o.name.startsWith("sqlite_")) continue;
  try { dst.exec(o.sql); } catch (e) {}
}
dst.exec("ATTACH DATABASE \"/var/www/jingyu/server/data/jingyu.db\" AS s");
const tabs = src.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ?").all("table", "sqlite_%").map((r) => r.name).filter((t) => !EXCLUDE.has(t));
dst.exec("BEGIN");
for (const t of tabs) {
  try { dst.exec("INSERT INTO main.\"" + t + "\" SELECT * FROM s.\"" + t + "\""); }
  catch (e) { console.error("skip data " + t + ": " + e.message); }
}
dst.exec("COMMIT");
dst.exec("DETACH s");
console.log("lite tables=" + tabs.length + " users=" + dst.prepare("SELECT COUNT(*) c FROM users").get().c);
dst.close();
'
chmod 644 "$OUT"
echo "remote lite: $(stat -c %s "$OUT") bytes"
EOS
  REMOTE_SNAP="/var/backups/jingyu/pull-lite.db"
else
  step "远端在线热备（全量，better-sqlite3 backup API，WAL 安全）"
  ssh "${SSH_OPTS[@]}" "$TARGET" 'sudo bash -s' <<'EOS'
set -euo pipefail
APP=/var/www/jingyu/server
OUT=/var/backups/jingyu/pull-latest.db
mkdir -p /var/backups/jingyu
cd "$APP"
node -e "
const D = require('./node_modules/better-sqlite3');
const db = new D('data/jingyu.db', { readonly: true, fileMustExist: true });
db.backup('$OUT').then(r => { console.log('pages=' + r.totalPages); db.close(); })
  .catch(e => { console.error('backup failed: ' + (e && e.message)); process.exit(1); });
"
chmod 644 "$OUT"
echo "remote snapshot: $(stat -c %s "$OUT") bytes"
EOS
  REMOTE_SNAP="/var/backups/jingyu/pull-latest.db"
fi

step "下载到 $DEST"
if [[ "$MODE" == "lite" ]]; then
  scp "${SSH_OPTS[@]}" -q "$TARGET:$REMOTE_SNAP" "$DEST" || die "下载失败"
  ok "$(du -h "$DEST" | cut -f1) 已落地"
else
  echo "  全量约 300MB，直连约 250KB/s ≈ 20 分钟；单连接超 3 分钟有断线风险，改用分块："
  echo "    bash tools/pull-chunks.sh"
  scp "${SSH_OPTS[@]}" -q "$TARGET:$REMOTE_SNAP" "$DEST" || die "下载失败（建议改用 tools/pull-chunks.sh）"
  ok "$(du -h "$DEST" | cut -f1) 已落地"
fi

step "本地体检（只读打开，核对业务表计数）"
DB_PATH="$DEST" node -e '
const D = require(process.env.PWD + "/server/node_modules/better-sqlite3");
const d = new D(process.env.DB_PATH, { readonly: true });
const ic = d.pragma("integrity_check", { simple: true });
const q = (t) => { try { return d.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c } catch { return "-" } };
console.log(`  integrity=${ic}`);
console.log(`  users=${q("users")} posts=${q("posts")} forums=${q("forums")} plugins=${q("plugins")} threads=${q("threads")} comments=${q("comments")}`);
console.log(`  plugin_readmes=${q("plugin_readmes")} plugin_readme_docs=${q("plugin_readme_docs")}`);
d.close();
' || die "快照打不开或已损坏"

step "清理本地旧快照（保留最近 $KEEP 份）"
ls -1t "$OUTDIR"/jingyu-prod-*.db 2>/dev/null | tail -n "+$((KEEP+1))" | while read -r old; do
  rm -f -- "$old" && echo "  删除 $(basename "$old")"
done

step "完成（$MODE）"
echo "  快照: $DEST"
echo "  用它跑本地后端（只读复现线上）:"
echo "    DB_PATH=\"$(echo "$DEST" | sed 's|^'"$ROOT"'/||')\" npm --prefix server start"
