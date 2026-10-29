#!/usr/bin/env bash
#
# 鲸域 · 境外一键部署（不依赖 ICP 备案）
#
# 用法：
#   bash deploy/overseas/deploy.sh all         # 前端 + 后端 + nginx + 证书（首次）
#   bash deploy/overseas/deploy.sh frontend    # 只发静态 + 重算 CSP
#   bash deploy/overseas/deploy.sh backend     # 只发后端代码并重启
#   bash deploy/overseas/deploy.sh env         # 生成 .env 并上传（密钥本地随机生成）
#   bash deploy/overseas/deploy.sh nginx       # 只重装 nginx 配置 + 重算 CSP
#   bash deploy/overseas/deploy.sh tls         # 只申请/续期证书
#   bash deploy/overseas/deploy.sh status      # 只看线上状态，不改任何东西
#   bash deploy/overseas/deploy.sh db-pull     # 把线上 SQLite 一致性备份拉回本地
#
# 前置条件：
#   1. 远端已跑过 deploy/overseas/server-setup.sh
#   2. 域名 A 记录已指到远端 IP，证书签发阶段先别开 Cloudflare 橙云（HTTP-01 会失败）
#   3. 本地能免密 SSH 到远端
#
# 环境变量覆盖（都有默认值）：
#   HOST=1.2.3.4  SUSER=root  DOMAIN=example.com  KEY=~/.ssh/id_ed25519
#   REMOTE_DIR=/var/www/jingyu  APP_USER=jingyu  LE_EMAIL=you@example.com
#
# 例：
#   HOST=45.32.1.2 DOMAIN=whale.example.com LE_EMAIL=me@mail.com \
#     bash deploy/overseas/deploy.sh all

set -euo pipefail

# ---------- 配置 ----------
HOST="${HOST:-__HOST__}"
SUSER="${SUSER:-root}"
DOMAIN="${DOMAIN:-__DOMAIN__}"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/jingyu}"
APP_USER="${APP_USER:-jingyu}"
SERVICE="jingyu"
LE_EMAIL="${LE_EMAIL:-}"

# ConnectTimeout 提到 20s：到日韩的链路偶发握手超时，10s 会把好连接判死（实测踩过）。
# ServerAlive* 兜住“连上了但卡住”的情况。
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new
          -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
SSH_CMD=(ssh "${SSH_OPTS[@]}" "$SUSER@$HOST")
SCP_CMD=(scp "${SSH_OPTS[@]}")
TARGET="${1:-all}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

need_config() {
  [[ "$HOST" == "__HOST__" ]]     && die "未配置 HOST。用法：HOST=1.2.3.4 DOMAIN=example.com bash deploy/overseas/deploy.sh $TARGET"
  [[ "$DOMAIN" == "__DOMAIN__" ]] && die "未配置 DOMAIN。用法：HOST=1.2.3.4 DOMAIN=example.com bash deploy/overseas/deploy.sh $TARGET"
  [[ -f "$KEY" ]] || die "找不到 SSH 私钥 $KEY（用 KEY=/path/to/key 指定）"
  return 0
}

connect() {
  step "检查服务器连通性"
  "${SSH_CMD[@]}" "echo ok" >/dev/null 2>&1 || die "无法连接 $SUSER@$HOST（密钥 $KEY）"
  ok "$SUSER@$HOST 可达 · 域名 $DOMAIN"
}

# ---------- 1. 前端 ----------
build_frontend() {
  step "构建前端"
  command -v node >/dev/null 2>&1 || die "本地没有 node，无法构建"
  node deploy/build.mjs | tail -6
  [[ -f dist/csp-hashes.json ]] || die "构建没有产出 dist/csp-hashes.json"
  ok "dist/ 构建完成"
}

push_frontend() {
  build_frontend

  step "上传静态资源（原子替换）"
  # 解到 dist.new 再 mv 替换，避免替换瞬间用户看到 404。
  # dist.old 可能是别的属主建的，清理一律 best-effort：删不掉就带时间戳挪开，
  # 不能让 set -e 在半途中断掉替换（那才会真的留下半个站点）。
  tar -czf - -C dist . | "${SSH_CMD[@]}" "
    set -e
    sudo rm -rf $REMOTE_DIR/dist.new
    sudo mkdir -p $REMOTE_DIR/dist.new
    sudo tar -xzf - -C $REMOTE_DIR/dist.new
    sudo chown -R $APP_USER:$APP_USER $REMOTE_DIR/dist.new
    if [ -e $REMOTE_DIR/dist.old ]; then
      sudo rm -rf $REMOTE_DIR/dist.old 2>/dev/null || true
      if [ -e $REMOTE_DIR/dist.old ]; then
        sudo mv $REMOTE_DIR/dist.old \"$REMOTE_DIR/dist.stale.\$(date +%s)\" 2>/dev/null || true
      fi
    fi
    if [ -d $REMOTE_DIR/dist ]; then sudo mv $REMOTE_DIR/dist $REMOTE_DIR/dist.old; fi
    sudo mv $REMOTE_DIR/dist.new $REMOTE_DIR/dist
    sudo rm -rf $REMOTE_DIR/dist.old 2>/dev/null || true
    echo \"  远端文件数: \$(sudo find $REMOTE_DIR/dist -type f | wc -l)\"
  "
  ok "静态资源已更新"
}

# ---------- 2. .env ----------
push_env() {
  step "生成 .env（密钥本地随机生成，不走网络）"
  mkdir -p .tmp
  local JWT SESSION
  JWT=$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
  SESSION=$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')

  if "${SSH_CMD[@]}" "sudo test -f $REMOTE_DIR/server/.env"; then
    warn "远端已有 .env —— 为免覆盖线上密钥，本次不写入"
    warn "确实要重置就手动执行：sudo rm $REMOTE_DIR/server/.env && 重跑 env"
    return 0
  fi

  cat > .tmp/env.production <<ENVEOF
# 由 deploy/overseas/deploy.sh env 生成 · $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# 权限必须 600，属主 $APP_USER
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

JWT_SECRET=$JWT
SESSION_SECRET=$SESSION
JWT_EXPIRES=604800

SITE_ORIGIN=https://$DOMAIN
ADMIN_PATH=/admin

# 无对象存储：图片落本地盘，由 nginx /uploads/ 同源提供
UPLOAD_MAX_SIZE=5242880
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif,image/webp
UPLOAD_URL_TTL=300
UPLOAD_LOCAL_DIR=$REMOTE_DIR/uploads

DB_PATH=$REMOTE_DIR/server/data/jingyu.db

MEMBERSHIP_GOAL_CENTS=68000
# 生产必须 0：置 1 等于开放「任何人点一下就把订单改成 paid」
MEMBERSHIP_SANDBOX=0
MEMBERSHIP_ORDER_TTL=1800
# 站外渠道（爱发电 / 收款码）订单有效期，3 天；爱发电用户常常隔天才付款
MEMBERSHIP_OFFSITE_TTL=${MEMBERSHIP_OFFSITE_TTL:-259200}
# 爱发电主页；留空则前端「爱发电」渠道自动置灰
AFDIAN_URL=${AFDIAN_URL:-}
PAY_MANUAL_QR=${PAY_MANUAL_QR:-0}

# 境外机器发不了国内短信；前端会看 /api/auth/phone/config 自动隐藏入口
SMS_PROVIDER=none
SMS_DEV=0

LOG_LEVEL=info
ENVEOF

  "${SCP_CMD[@]}" .tmp/env.production "$SUSER@$HOST:/tmp/env.production" >/dev/null
  "${SSH_CMD[@]}" "
    set -e
    sudo mkdir -p $REMOTE_DIR/server
    sudo mv /tmp/env.production $REMOTE_DIR/server/.env
    sudo chown $APP_USER:$APP_USER $REMOTE_DIR/server/.env
    sudo chmod 600 $REMOTE_DIR/server/.env
    sudo ls -l $REMOTE_DIR/server/.env
  "
  rm -f .tmp/env.production
  ok ".env 已写入（600，属主 $APP_USER）"
  warn "SITE_ORIGIN 固定为 https://$DOMAIN —— 证书没签下来之前 cookie 的 secure 标志会导致登录不上"
}

# ---------- 3. CSP + nginx ----------
push_nginx() {
  step "生成安全头（CSP 内联哈希来自 dist/csp-hashes.json）"
  [[ -f dist/csp-hashes.json ]] || die "缺少 dist/csp-hashes.json，先跑：node deploy/build.mjs"
  mkdir -p .tmp

  # CSP 值里全是单引号，走 shell 双引号会被吞掉。用 node 读 JSON 拼字符串，绕开引号地狱。
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    const j = JSON.parse(readFileSync("dist/csp-hashes.json", "utf8"));
    const hashes = j.inline.map((x) => `\u0027${x.hash}\u0027`).join(" ");
    const csp = [
      "default-src \u0027self\u0027",
      "base-uri \u0027self\u0027",
      "object-src \u0027none\u0027",
      `script-src \u0027self\u0027 ${hashes}`,
      "style-src \u0027self\u0027 \u0027unsafe-inline\u0027",
      "img-src \u0027self\u0027 data: blob: https://avatars.githubusercontent.com",
      "media-src \u0027self\u0027 blob:",
      "font-src \u0027self\u0027 data:",
      "connect-src \u0027self\u0027",
      "frame-src \u0027self\u0027",
      "form-action \u0027self\u0027",
      "frame-ancestors \u0027self\u0027"
    ].join("; ");
    const s = [
      "# 由 deploy/overseas/deploy.sh 自动生成，不要手改 —— 下次部署会覆盖",
      "# 内联脚本哈希来自 dist/csp-hashes.json（build.mjs 产出）",
      "# 注意：nginx 的 add_header 一旦在某个 location 里出现，就不再继承上级 add_header，",
      "#      所以每个 location 都要 include 本文件，不能只在 server 块里写一次。",
      "add_header Strict-Transport-Security \"max-age=15552000\" always;",
      "add_header X-Content-Type-Options \"nosniff\" always;",
      "add_header X-Frame-Options \"SAMEORIGIN\" always;",
      "add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;",
      "add_header Permissions-Policy \"geolocation=(), microphone=(), camera=()\" always;",
      "add_header Cross-Origin-Opener-Policy \"same-origin\" always;",
      `add_header Content-Security-Policy "${csp}" always;`,
      ""
    ].join("\n");
    writeFileSync(".tmp/jingyu-security-headers.conf", s, "utf8");
    console.log("  已生成 " + j.inline.length + " 条内联哈希");
  '

  step "决定证书路径"
  # 证书链和私钥先用自签占位，签完由 tls 步骤 sed 换成 letsencrypt。
  # 这样 nginx -t 永远能过，不会出现「改配置要证书、签证书要配置生效」的死循环。
  "${SSH_CMD[@]}" "
    set -e
    if sudo test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
      echo letsencrypt
    else
      sudo mkdir -p /etc/nginx/selfsigned
      if ! sudo test -f /etc/nginx/selfsigned/$DOMAIN.crt; then
        sudo openssl req -x509 -nodes -newkey rsa:2048 -days 3 \
          -subj '/CN=$DOMAIN' \
          -keyout /etc/nginx/selfsigned/$DOMAIN.key \
          -out /etc/nginx/selfsigned/$DOMAIN.crt >/dev/null 2>&1
      fi
      echo selfsigned
    fi
  " > .tmp/cert-mode.txt
  local CERT_MODE CRT KEYF
  CERT_MODE=$(tr -d '\r\n' < .tmp/cert-mode.txt)
  if [[ "$CERT_MODE" == "letsencrypt" ]]; then
    CRT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    KEYF="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    ok "使用 Let's Encrypt 证书"
  else
    CRT="/etc/nginx/selfsigned/$DOMAIN.crt"
    KEYF="/etc/nginx/selfsigned/$DOMAIN.key"
    warn "尚未签发证书，先用自签占位（浏览器会告警，签完自动换）"
  fi

  step "渲染并上传 nginx 配置"
  sed -e "s|__DOMAIN__|$DOMAIN|g" \
      -e "s|__APP_DIR__|$REMOTE_DIR|g" \
      -e "s|__CERT_CRT__|$CRT|g" \
      -e "s|__CERT_KEY__|$KEYF|g" \
      deploy/overseas/nginx.conf > .tmp/jingyu.conf

  # 渲染后不该再有占位符残留：有就是模板加了变量而这里没同步
  if grep -q '__[A-Z_]\+__' .tmp/jingyu.conf; then
    grep -o '__[A-Z_]\+__' .tmp/jingyu.conf | sort -u
    die "nginx.conf 里有未替换的占位符（见上）"
  fi

  "${SCP_CMD[@]}" .tmp/jingyu.conf                  "$SUSER@$HOST:/tmp/jingyu.conf" >/dev/null
  "${SCP_CMD[@]}" .tmp/jingyu-security-headers.conf "$SUSER@$HOST:/tmp/jingyu-security-headers.conf" >/dev/null
  "${SCP_CMD[@]}" deploy/overseas/limit-req.conf    "$SUSER@$HOST:/tmp/jingyu-limit-req.conf" >/dev/null

  "${SSH_CMD[@]}" "
    set -e
    sudo mkdir -p /etc/nginx/snippets
    sudo cp /tmp/jingyu-security-headers.conf /etc/nginx/snippets/jingyu-security-headers.conf
    sudo cp /tmp/jingyu-limit-req.conf        /etc/nginx/conf.d/00-limit-req.conf
    sudo cp /tmp/jingyu.conf                  /etc/nginx/sites-available/jingyu.conf
    sudo ln -sf /etc/nginx/sites-available/jingyu.conf /etc/nginx/sites-enabled/jingyu.conf
    # 默认站点会和本站抢 default_server，签证书时 ACME 请求会跑到别处
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl reload nginx
  " || { "${SSH_CMD[@]}" "sudo nginx -t" || true; die "nginx 配置检查失败（见上）"; }
  ok "nginx 配置已安装并 reload"
}

# ---------- 4. 后端 ----------
push_backend() {
  [[ -d server ]] || die "server/ 目录不存在"

  step "上传后端代码"
  # 排除 node_modules / .env：依赖在服务器装，密钥只存服务器。
  # 排除 data / uploads：这两个是线上生产数据（SQLite 库 + 用户上传图），
  # 不排除就会用本地演示库覆盖线上真实用户，且不可恢复。
  tar -czf - --exclude='node_modules' --exclude='.env' --exclude='*.log' \
              --exclude='data' --exclude='uploads' -C server . | \
    "${SSH_CMD[@]}" "
      set -e
      sudo mkdir -p $REMOTE_DIR/server
      sudo tar -xzf - -C $REMOTE_DIR/server
      sudo chown -R $APP_USER:$APP_USER $REMOTE_DIR/server
    "
  ok "代码已上传"

  step "安装依赖（仅生产依赖）"
  # better-sqlite3 在没有预编译包的平台要现场编译，server-setup.sh 装了 build-essential
  "${SSH_CMD[@]}" "cd $REMOTE_DIR/server && sudo -u $APP_USER npm ci --omit=dev 2>&1 | tail -6"
  ok "依赖安装完成"

  if ! "${SSH_CMD[@]}" "sudo test -f $REMOTE_DIR/server/.env"; then
    warn "远端缺少 .env，先跑：bash deploy/overseas/deploy.sh env"
    die "缺少 .env（服务起不来）"
  fi
  ok ".env 存在"

  step "安装 systemd 服务"
  if ! "${SSH_CMD[@]}" "systemctl cat $SERVICE" >/dev/null 2>&1; then
    sed -e "s|/var/www/jingyu|$REMOTE_DIR|g" \
        -e "s|^User=jingyu$|User=$APP_USER|" \
        -e "s|^Group=jingyu$|Group=$APP_USER|" \
        deploy/jingyu.service > .tmp/jingyu.service
    "${SCP_CMD[@]}" .tmp/jingyu.service "$SUSER@$HOST:/tmp/jingyu.service" >/dev/null
    "${SSH_CMD[@]}" "
      sudo mv /tmp/jingyu.service /etc/systemd/system/$SERVICE.service
      sudo systemctl daemon-reload
      sudo systemctl enable $SERVICE
    "
    ok "systemd 服务已注册并设为开机自启"
  else
    ok "systemd 服务已存在"
  fi

  step "重启服务"
  "${SSH_CMD[@]}" "sudo systemctl restart $SERVICE && sleep 2 && systemctl is-active $SERVICE"
  ok "服务已重启"

  step "健康检查"
  local CODE
  CODE=$("${SSH_CMD[@]}" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz || echo 000")
  if [[ "$CODE" == "200" ]]; then
    ok "健康检查通过（HTTP 200）"
  else
    warn "健康检查返回 $CODE，最近日志："
    "${SSH_CMD[@]}" "sudo journalctl -u $SERVICE -n 30 --no-pager"
    die "服务异常"
  fi
}

# ---------- 5. 证书 ----------
push_tls() {
  step "核对 DNS 指向"
  local REMOTE_IP LOCAL_IP
  REMOTE_IP=$("${SSH_CMD[@]}" "curl -s --max-time 8 https://api.ipify.org || echo ''")
  LOCAL_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)
  if [[ -z "$LOCAL_IP" ]]; then
    LOCAL_IP=$(nslookup "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2}' | tail -1 || true)
  fi
  warn "远端出网 IP : ${REMOTE_IP:-取不到}"
  warn "$DOMAIN 解析: ${LOCAL_IP:-取不到}"
  if [[ -n "$REMOTE_IP" && -n "$LOCAL_IP" && "$REMOTE_IP" != "$LOCAL_IP" ]]; then
    warn "两者不一致 —— HTTP-01 验证会失败。先把 A 记录改对，并确认没开 Cloudflare 橙云"
  fi

  step "签发 / 续期证书"
  local MAIL_ARG="--register-unsafely-without-email"
  [[ -n "$LE_EMAIL" ]] && MAIL_ARG="-m $LE_EMAIL"
  # 坑：`certbot ... | tail -12` 的退出码是 tail 的，certbot 失败会被吞掉。
  # 不开 pipefail 的话，签发失败后脚本照样往下 sed nginx 到不存在的 LE 路径，
  # 紧接着 reload 失败 —— 站就挂了。必须 set -eo pipefail。
  # 同时把 www 一起签进 SAN，省得以后再补一次。
  if ! "${SSH_CMD[@]}" "
    set -eo pipefail
    sudo mkdir -p /var/www/certbot
    sudo certbot certonly --webroot -w /var/www/certbot \
      -d $DOMAIN -d www.$DOMAIN --agree-tos $MAIL_ARG --non-interactive --keep-until-expiring 2>&1 | tail -12
  "; then
    warn "签发失败。逐项排查："
    warn "  1) 80 端口是否放行（云厂商安全组 + ufw）"
    warn "  2) DNS 是否生效：dig +short $DOMAIN"
    warn "  3) 是否开了 Cloudflare 代理（橙云）—— 签发期间必须关成 DNS only"
    warn "  4) 已签过但文件不在预期路径：sudo certbot certificates"
    die "证书签发失败"
  fi
  ok "证书已签发"

  step "把 nginx 切到正式证书"
  "${SSH_CMD[@]}" "
    set -e
    sudo sed -i 's|/etc/nginx/selfsigned/$DOMAIN.crt|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g; s|/etc/nginx/selfsigned/$DOMAIN.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g' \
      /etc/nginx/sites-available/jingyu.conf
    sudo nginx -t
    sudo systemctl reload nginx
  "
  ok "HTTPS 已启用（正式证书）"

  step "配置自动续期钩子"
  # certbot 默认续期后不会 reload nginx，nginx 会一直端旧证书直到手动 reload
  "${SSH_CMD[@]}" "
    set -e
    sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
    sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    sudo systemctl enable --now certbot.timer 2>/dev/null || sudo systemctl enable --now certbot-renew.timer 2>/dev/null || true
    sudo certbot renew --dry-run 2>&1 | tail -5
  "
  ok "自动续期已配置（renew 后自动 reload nginx）"
}

# ---------- 6. 状态 / 备份 ----------
show_status() {
  step "线上状态"
  "${SSH_CMD[@]}" "
    echo \"  服务      : \$(systemctl is-active $SERVICE 2>/dev/null || echo 未安装)\"
    echo \"  nginx     : \$(systemctl is-active nginx)\"
    echo \"  证书到期  : \$(sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/$DOMAIN/cert.pem 2>/dev/null | cut -d= -f2 || echo 未签发)\"
    echo \"  内存      : \$(free -h | awk '/^Mem:/{print \$3\" / \"\$2}')\"
    echo \"  磁盘      : \$(df -h / | awk 'NR==2{print \$3\" / \"\$2}')\"
    echo \"  上传体积  : \$(sudo du -sh $REMOTE_DIR/uploads 2>/dev/null | cut -f1)\"
    echo \"  数据库    : \$(sudo du -sh $REMOTE_DIR/server/data 2>/dev/null | cut -f1)\"
    echo \"  本月流量  : \$(cat /proc/net/dev | awk 'NR>2{s+=\$1+\$9} END{printf \"%.2f GB\", s/1024/1024/1024}')\"
  "
  local HTTP
  HTTP=$("${SSH_CMD[@]}" "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1/healthz -H 'Host: $DOMAIN' || echo 000")
  ok "本机 HTTPS 自测: $HTTP"
}

db_pull() {
  step "线上 SQLite 一致性备份"
  # WAL 模式下直接 cp 会丢掉未 checkpoint 的事务；必须走 .backup
  local TS
  TS=$(date +%Y%m%d-%H%M%S)
  mkdir -p .tmp
  "${SSH_CMD[@]}" "
    set -e
    sudo mkdir -p /tmp/jingyu-bak
    sudo sqlite3 $REMOTE_DIR/server/data/jingyu.db \".backup '/tmp/jingyu-bak/jingyu-$TS.db'\"
    sudo chmod 644 /tmp/jingyu-bak/jingyu-$TS.db
    echo -n '  integrity_check: '
    sudo sqlite3 /tmp/jingyu-bak/jingyu-$TS.db 'PRAGMA integrity_check;'
  "
  "${SCP_CMD[@]}" "$SUSER@$HOST:/tmp/jingyu-bak/jingyu-$TS.db" ".tmp/jingyu-$TS.db" >/dev/null
  "${SSH_CMD[@]}" "sudo rm -f /tmp/jingyu-bak/jingyu-$TS.db"
  ok "已拉回 .tmp/jingyu-$TS.db（$(du -h ".tmp/jingyu-$TS.db" | cut -f1)）"
}

# ---------- 执行 ----------
case "$TARGET" in
  status)   need_config; connect; show_status ;;
  all)
    need_config; connect
    push_frontend
    push_env
    push_backend
    push_nginx
    push_tls || warn "证书步骤未完成 —— 站点暂时是自签证书（HTTP 通，浏览器告警）"
    show_status
    ;;
  frontend) need_config; connect; push_frontend; push_nginx ;;
  backend)  need_config; connect; push_backend ;;
  env)      need_config; connect; push_env ;;
  nginx)    need_config; connect; push_nginx ;;
  tls)      need_config; connect; push_tls ;;
  db-pull)  need_config; connect; db_pull ;;
  *)        die "未知目标：$TARGET（可选 all|frontend|backend|env|nginx|tls|status|db-pull）" ;;
esac

echo ""
ok "完成 · https://$DOMAIN"
