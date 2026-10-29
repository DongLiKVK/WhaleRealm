#!/usr/bin/env bash
#
# 分块上传境内灾备库到境外（规避长连接被中断 / 跳板抖动）
#
# 背景与教训：
#   1) `cat 300MB | ssh whale 'cat > file'` 走 ProxyJump 境内跳板，3m37s 后报
#      `Connection closed by UNKNOWN port 65535`，远端文件根本没写成 → 长连接有时间上限。
#   2) 20MB 分块走跳板，前 2 块成功，第 3 块报 `Timeout, server not responding`
#      （ServerAliveCountMax=4 太严格，网络一抖就断）→ 需要宽松保活 + 重试。
#   3) 本地直连 158.247.215.153:22 认证成功，10MB/44s（238KB/s），可绕开跳板。
#
# 本脚本：分块 + 断点续传（远端已有的块按大小跳过）+ 每块最多 3 次重试 +
#         宽松 ServerAlive（容忍 5 分钟无响应）+ 最终 sha256 全量校验。
#
# 用法：
#   bash tools/push-chunks.sh                           # 默认走跳板(whale)，20MB 块
#   DIRECT=1 bash tools/push-chunks.sh                  # 直连境外，20MB 块
#   DIRECT=1 CHUNK_MB=10 bash tools/push-chunks.sh      # 直连 + 10MB 块
set -uo pipefail

SSH_CONFIG="${SSH_CONFIG:-$HOME/.ssh/config_whale}"
ALIAS="${ALIAS:-whale}"
SRC="${SRC:-.tmp/backup/jingyu-cn-20261026.db}"
CHUNK_MB="${CHUNK_MB:-20}"
DIRECT="${DIRECT:-0}"
REMOTE_DIR="/tmp/jingyu-chunks"
REMOTE_OUT="/tmp/import-cn.db"

step() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$SRC" ]] || die "源文件不存在: $SRC"

if [[ "$DIRECT" == "1" ]]; then
  SSH_OPTS=(-i "$HOME/.ssh/jingyu_ed25519" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR root@158.247.215.153)
  step "模式：直连境外 158.247.215.153"
else
  SSH_OPTS=(-F "$SSH_CONFIG" -o LogLevel=ERROR "$ALIAS")
  step "模式：经跳板 $ALIAS"
fi

rssh() { ssh "${SSH_OPTS[@]}" -o ServerAliveInterval=10 -o ServerAliveCountMax=30 -o ConnectTimeout=20 "$@"; }

LOCAL_SHA="$(sha256sum "$SRC" | cut -d' ' -f1)"
LOCAL_SIZE="$(stat -c %s "$SRC")"
step "源 $SRC  size=$LOCAL_SIZE"
echo "  sha256=$LOCAL_SHA"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
step "切块 ${CHUNK_MB}MB"
split -b "${CHUNK_MB}M" -d -a 3 "$SRC" "$WORK/chunk-"
TOTAL=$(ls -1 "$WORK"/chunk-* | wc -l | tr -d ' ')
ok "$TOTAL 块"

rssh "mkdir -p $REMOTE_DIR" || die "远端目录创建失败"

step "逐块上传（远端已有的按大小跳过）"
i=0; skipped=0; uploaded=0
for f in "$WORK"/chunk-*; do
  i=$((i+1))
  name="$(basename "$f")"
  lsize=$(stat -c %s "$f")
  rsize=$(rssh "stat -c %s $REMOTE_DIR/$name 2>/dev/null" || echo 0)
  if [[ "$rsize" == "$lsize" ]]; then
    printf '  [%d/%d] %s 已存在，跳过\n' "$i" "$TOTAL" "$name"
    skipped=$((skipped+1)); continue
  fi
  printf '  [%d/%d] %s (%d MB) ... ' "$i" "$TOTAL" "$name" "$((lsize/1048576))"
  n=0; success=0
  while (( n < 3 )); do
    if cat "$f" | rssh "cat > $REMOTE_DIR/$name"; then
      got=$(rssh "stat -c %s $REMOTE_DIR/$name 2>/dev/null" || echo 0)
      if [[ "$got" == "$lsize" ]]; then success=1; break; fi
      warn "大小不符（远端 $got / 本地 $lsize）"
    else
      warn "传输失败"
    fi
    n=$((n+1))
    (( n < 3 )) && { printf '    重试 %d/3 ... ' "$n"; sleep 3; }
    rssh "rm -f $REMOTE_DIR/$name" >/dev/null 2>&1 || true
  done
  (( success == 1 )) || die "第 $i 块三次重试均失败：$name"
  echo "ok"; uploaded=$((uploaded+1))
done
ok "上传完成：新传 $uploaded 块，跳过 $skipped 块"

step "远端合并 + 校验"
RESULT=$(rssh "cat $REMOTE_DIR/chunk-* > $REMOTE_OUT && stat -c %s $REMOTE_OUT && sha256sum $REMOTE_OUT | cut -d' ' -f1")
R_SIZE=$(echo "$RESULT" | sed -n 1p)
R_SHA=$(echo "$RESULT" | sed -n 2p)
echo "  远端 size=$R_SIZE"
echo "  远端 sha256=$R_SHA"
[[ "$R_SIZE" == "$LOCAL_SIZE" ]] || die "大小不一致：本地 $LOCAL_SIZE vs 远端 $R_SIZE"
[[ "$R_SHA" == "$LOCAL_SHA" ]] || die "sha256 不一致"
ok "校验通过"
rssh "rm -rf $REMOTE_DIR" >/dev/null 2>&1 || true
step "完成：远端 $REMOTE_OUT 就绪"
