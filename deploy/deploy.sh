#!/usr/bin/env bash
#
# 鲸域 · 一键部署
#
# 用法：
#   bash deploy/deploy.sh              前端 + 后端全量部署
#   bash deploy/deploy.sh frontend     只发前端
#   bash deploy/deploy.sh backend      只发后端
#
# 前置条件：
#   1. 服务器已跑过 deploy/server-setup.sh
#   2. 本地能免密 SSH 到服务器
#   3. 后端首次部署前，远程 server/.env 已创建（脚本不会覆盖它）

set -euo pipefail

# ---------- 配置 ----------
HOST="${HOST:-43.142.153.74}"
SUSER="${SUSER:-ubuntu}"
KEY="${KEY:-$HOME/.ssh/jingyu_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/jingyu}"
SERVICE="jingyu"

SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
SSH_CMD=(ssh "${SSH_OPTS[@]}" "$SUSER@$HOST")

TARGET="${1:-all}"

# ---------- 输出helper ----------
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 0. 连通性检查 ----------
step "检查服务器连通性"
"${SSH_CMD[@]}" "echo ok" >/dev/null 2>&1 || die "无法连接 $SUSER@$HOST，请确认密钥 $KEY 与网络"
ok "$HOST 可达"

# ---------- 1. 前端 ----------
if [[ "$TARGET" == "all" || "$TARGET" == "frontend" ]]; then
  step "构建前端"
  command -v node >/dev/null 2>&1 || die "本地没有 node，无法构建"
  node deploy/build.mjs
  ok "dist/ 构建完成"

  step "上传静态资源"
  # 先解到 dist.new 再原子替换，避免替换过程中用户看到 404
  # 注意：远端用独立脚本执行，避免 shell 里 && 与 || 的优先级陷阱
  # dist.old 上一次部署可能由别的用户（jingyu）创建，ubuntu 删不掉它的内容，
  # 所以清理一律 best-effort；删不掉就改个带时间戳的名字挪开，不能让 set -e 中断替换。
  tar -czf - -C dist . | "${SSH_CMD[@]}" "
    set -e
    cd $REMOTE_DIR
    rm -rf dist.new && mkdir -p dist.new
    tar -xzf - -C dist.new
    if [ -e dist.old ]; then
      rm -rf dist.old 2>/dev/null || true
      if [ -e dist.old ]; then mv dist.old \"dist.stale.\$(date +%s)\" 2>/dev/null || true; fi
    fi
    if [ -d dist ]; then mv dist dist.old; fi
    mv dist.new dist
    rm -rf dist.old 2>/dev/null || true
    echo '  文件数:' \$(find dist -type f | wc -l)
  "
  ok "静态资源已更新（原子替换）"
fi

# ---------- 2. 后端 ----------
if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then
  if [[ ! -d server ]]; then
    warn "server/ 目录不存在，跳过后端部署"
    warn "等后端代码产出后重跑：bash deploy/deploy.sh backend"
  else
    step "上传后端代码"
    # 排除 node_modules 与 .env：依赖在服务器装，.env 只存在服务器上
    tar -czf - --exclude='node_modules' --exclude='.env' --exclude='*.log' -C server . | \
      "${SSH_CMD[@]}" "mkdir -p $REMOTE_DIR/server && tar -xzf - -C $REMOTE_DIR/server"
    ok "代码已上传"

    step "安装依赖（仅生产依赖）"
    if ! "${SSH_CMD[@]}" "test -f $REMOTE_DIR/server/package.json"; then
      die "远程缺少 package.json，检查本地 server/ 目录结构"
    fi
    "${SSH_CMD[@]}" "cd $REMOTE_DIR/server && npm ci --omit=dev 2>&1 | tail -5"
    ok "依赖安装完成"

    step "检查 .env"
    if ! "${SSH_CMD[@]}" "test -f $REMOTE_DIR/server/.env"; then
      warn "远程缺少 $REMOTE_DIR/server/.env"
      warn "首次部署请先在服务器上创建："
      warn "  sudo -u jingyu nano $REMOTE_DIR/server/.env"
      warn "  内容参考 server/.env.example，权限设为 600"
      die "缺少 .env，中止"
    fi
    ok ".env 存在"

    step "安装 systemd 服务"
    if ! "${SSH_CMD[@]}" "systemctl cat $SERVICE" >/dev/null 2>&1; then
      scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
        deploy/jingyu.service "$SUSER@$HOST:/tmp/jingyu.service" >/dev/null
      "${SSH_CMD[@]}" "sudo mv /tmp/jingyu.service /etc/systemd/system/$SERVICE.service && \
                        sudo systemctl daemon-reload && sudo systemctl enable $SERVICE"
      ok "systemd 服务已注册并设为开机自启"
    else
      ok "systemd 服务已存在"
    fi

    step "重启服务"
    "${SSH_CMD[@]}" "sudo systemctl restart $SERVICE && sleep 2 && systemctl is-active $SERVICE"
    ok "服务已重启"

    step "健康检查"
    CODE=$("${SSH_CMD[@]}" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz || echo 000")
    if [[ "$CODE" == "200" ]]; then
      ok "健康检查通过（HTTP 200）"
    else
      warn "健康检查返回 $CODE"
      "${SSH_CMD[@]}" "sudo journalctl -u $SERVICE -n 20 --no-pager"
      die "服务异常，查看上方日志"
    fi
  fi
fi

# ---------- 3. 汇总 ----------
step "部署完成"
"${SSH_CMD[@]}" "
  echo \"  服务状态: \$(systemctl is-active $SERVICE 2>/dev/null || echo '未安装')\"
  echo \"  内存占用: \$(free -h | awk '/^Mem:/{print \$3\" / \"\$2}')\"
  echo \"  磁盘占用: \$(df -h / | awk 'NR==2{print \$3\" / \"\$2}')\"
"
