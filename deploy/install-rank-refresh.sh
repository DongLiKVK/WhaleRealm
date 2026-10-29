#!/usr/bin/env bash
#
# 安装 / 更新 AI 排行每日刷新任务（生产：158.247.215.153）
#
# 用法：
#   bash deploy/install-rank-refresh.sh
#   RUN_NOW=0 bash deploy/install-rank-refresh.sh     # 只装定时器，不立刻跑
#
# 做的事：
#   1. 上传 tools/fetch-rank.mjs、fetch-livebench.mjs、refresh-rank-daily.mjs
#   2. 第一次安装时用 dist 里现有的榜单快照给 workdir 做基线（名次变化要用）
#   3. 安装 jingyu-rank-refresh.service / .timer，enable --now
#   4. 默认立刻跑一次，验证整条链路

set -euo pipefail

HOST="${HOST:-158.247.215.153}"
SUSER="${SUSER:-root}"
KEY="${KEY:-$HOME/.ssh/jingyu_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/jingyu-rank}"
DIST="${DIST:-/var/www/jingyu/dist}"
BACKUP="${BACKUP:-/var/www/jingyu/backup}"

SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
SSH=(ssh "${SSH_OPTS[@]}" "$SUSER@$HOST")
SCP=(scp "${SSH_OPTS[@]}")

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  OK %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31m  FAIL %s\033[0m\n' "$*" >&2; exit 1; }

step "检查连通性"
"${SSH[@]}" "echo ok" >/dev/null 2>&1 || die "连不上 $SUSER@$HOST（密钥 $KEY）"
ok "$HOST 可达"

step "创建目录并上传抓取器"
"${SSH[@]}" "mkdir -p '$REMOTE_DIR/tools' '$REMOTE_DIR/js' '$BACKUP'"
tar -czf - -C tools fetch-rank.mjs fetch-livebench.mjs refresh-rank-daily.mjs \
  | "${SSH[@]}" "tar -xzf - -C '$REMOTE_DIR/tools'"
ok "tools/ 已更新"

step "补齐上一版基线（只在缺失时）"
"${SSH[@]}" bash -s <<EOF
set -eu
for f in rank-data livebench-data; do
  dst="$REMOTE_DIR/js/\$f.js"
  if [ ! -s "\$dst" ]; then
    src=\$(ls -t "$DIST/assets/\$f".*.js 2>/dev/null | head -1 || true)
    if [ -n "\$src" ]; then cp "\$src" "\$dst"; echo "  seed \$f <- \$src"; fi
  fi
done
EOF
ok "基线检查完成"

step "安装 systemd 单元"
"${SCP[@]}" deploy/jingyu-rank-refresh.service deploy/jingyu-rank-refresh.timer \
  "$SUSER@$HOST:/tmp/"
"${SSH[@]}" "install -m 644 /tmp/jingyu-rank-refresh.service /etc/systemd/system/jingyu-rank-refresh.service
            install -m 644 /tmp/jingyu-rank-refresh.timer   /etc/systemd/system/jingyu-rank-refresh.timer
            rm -f /tmp/jingyu-rank-refresh.service /tmp/jingyu-rank-refresh.timer
            systemctl daemon-reload
            systemctl enable --now jingyu-rank-refresh.timer"
ok "定时器已启用"

step "下次触发时间"
"${SSH[@]}" "systemctl list-timers jingyu-rank-refresh.timer --no-pager | sed -n '1,3p'"

if [ "${RUN_NOW:-1}" = "1" ]; then
  step "立即跑一次（验证链路）"
  "${SSH[@]}" "systemctl start jingyu-rank-refresh.service || true
              echo '--- 最近日志 ---'
              journalctl -u jingyu-rank-refresh.service -n 30 --no-pager || true
              echo '--- last-run.json ---'
              cat '$REMOTE_DIR/last-run.json' 2>/dev/null || true"
fi

step "完成"
"${SSH[@]}" 'echo "  计时器: $(systemctl is-active jingyu-rank-refresh.timer)"; echo "  服务最后一次: $(systemctl show -p Result --value jingyu-rank-refresh.service)"'
