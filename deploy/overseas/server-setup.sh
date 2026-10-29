#!/usr/bin/env bash
#
# 鲸域 · 境外 VPS 初始化（不依赖备案）
#
# 目标环境：任意 Ubuntu 22.04 / 24.04 干净机器（腾讯云轻量香港、阿里云轻量香港、
#           Vultr、RackNerd、Oracle Free Tier 都可以，脚本只认 Ubuntu）
#
# 与 deploy/server-setup.sh 的差别：
#   1) 不带任何大陆机房假设：不装 COS 相关、不改 swappiness 之外的内核参数也够用
#   2) 多装 certbot：境外机器要自己签 Let's Encrypt，而不是走腾讯云免费证书
#   3) 多建 /var/www/certbot：certbot --webroot 的验证目录，nginx 里要放行
#   4) 时区保持 UTC（境外机器改成 Asia/Shanghai 会让日志和 cron 更难对）
#
# 用法：
#   sudo bash server-setup.sh
#
# 幂等：重复执行不会重复安装或破坏已有配置。

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[X]${NC} $*" >&2; }

trap 'err "第 ${LINENO} 行执行失败，脚本中止。上行命令：${BASH_COMMAND}"' ERR

if [[ $EUID -ne 0 ]]; then
  err "请用 sudo 运行：sudo bash server-setup.sh"
  exit 1
fi

APP_USER="jingyu"
APP_DIR="/var/www/jingyu"
CERTBOT_WEBROOT="/var/www/certbot"
NODE_MAJOR="20"
SWAP_SIZE="2G"

echo "=============================================="
echo " 鲸域境外部署 · 服务器初始化"
echo " 时间：$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="

# ---------- 1. 系统更新 ----------
export DEBIAN_FRONTEND=noninteractive
info "更新软件包索引..."
apt-get update -qq
info "安装基础工具..."
apt-get install -y -qq \
  curl wget git vim htop unzip jq \
  build-essential ca-certificates gnupg \
  ufw fail2ban rsync sqlite3 >/dev/null
info "基础工具安装完成"

# ---------- 2. Node.js ----------
if command -v node >/dev/null 2>&1 && [[ "$(node -v)" == v${NODE_MAJOR}.* ]]; then
  info "Node.js 已安装：$(node -v)"
else
  info "安装 Node.js ${NODE_MAJOR} LTS..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
  info "Node.js 安装完成：$(node -v) / npm $(npm -v)"
fi

# ---------- 3. Nginx + certbot ----------
if command -v nginx >/dev/null 2>&1; then
  info "Nginx 已安装：$(nginx -v 2>&1 | cut -d/ -f2)"
else
  info "安装 Nginx..."
  apt-get install -y -qq nginx >/dev/null
  info "Nginx 安装完成：$(nginx -v 2>&1 | cut -d/ -f2)"
fi

if command -v certbot >/dev/null 2>&1; then
  info "certbot 已安装"
else
  info "安装 certbot（snap 太重，用 apt 版够签发和续期）..."
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  info "certbot 安装完成：$(certbot --version 2>&1)"
fi

systemctl enable nginx >/dev/null 2>&1
if ! systemctl restart nginx; then
  err "Nginx 启动失败，最近日志："
  journalctl -u nginx -n 15 --no-pager || true
  err "常见原因：80/443 被其它进程占用。用 sudo ss -tlnp | grep -E ':(80|443) ' 排查"
  exit 1
fi
info "Nginx 运行中"

# ---------- 4. 应用用户 ----------
if id "$APP_USER" &>/dev/null; then
  info "用户 $APP_USER 已存在"
else
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  info "创建系统用户 $APP_USER（无 sudo、无登录 shell）"
fi

# 当前登录用户（ubuntu / root / debian）加入应用组，方便 rsync 部署
CUR_USER="${SUDO_USER:-root}"
if id "$CUR_USER" &>/dev/null && [[ "$CUR_USER" != "root" ]]; then
  usermod -aG "$APP_USER" "$CUR_USER"
  info "已将 $CUR_USER 加入 $APP_USER 组"
fi

# ---------- 5. 目录结构 ----------
mkdir -p "$APP_DIR"/{dist,server,logs,uploads} "$CERTBOT_WEBROOT"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod -R 775 "$APP_DIR"
# certbot 验证目录属主留 root，nginx 只需读
chown -R root:root "$CERTBOT_WEBROOT"
chmod 755 "$CERTBOT_WEBROOT"
info "应用目录就绪：$APP_DIR"
info "certbot 验证目录就绪：$CERTBOT_WEBROOT"

# ---------- 6. Swap（小内存机器必备：better-sqlite3 编译 + npm ci 会吃满 1G） ----------
if swapon --show | grep -q '/swapfile'; then
  info "Swap 已存在：$(swapon --show=SIZE --noheadings | head -1)"
else
  info "创建 ${SWAP_SIZE} Swap..."
  fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  info "Swap 创建完成"
fi

# ---------- 7. 防火墙 ----------
info "配置 ufw..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
info "ufw 已启用：22 / 80 / 443"

# ---------- 8. fail2ban ----------
cat > /etc/fail2ban/jail.local <<'JAIL'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
JAIL
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban
info "fail2ban 已启用（SSH 10 分钟内错 5 次封 1 小时）"

# ---------- 9. 内核参数 ----------
cat > /etc/sysctl.d/99-jingyu.conf <<'SYSCTL'
# 单机高并发场景的连接队列调优
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000
# WebSocket 长连接需要
fs.file-max = 200000
SYSCTL
sysctl -p /etc/sysctl.d/99-jingyu.conf >/dev/null
info "内核参数已优化"

# ---------- 10. 汇总 ----------
echo ""
echo "=============================================="
echo -e "${GREEN} 初始化完成${NC}"
echo "=============================================="
echo " Node.js      : $(node -v)"
echo " Nginx        : $(nginx -v 2>&1 | cut -d/ -f2)"
echo " certbot      : $(certbot --version 2>&1 | awk '{print $2}')"
echo " 应用目录     : $APP_DIR"
echo " 运行用户     : $APP_USER"
echo " 时区         : $(timedatectl show -p Timezone --value)"
echo " Swap         : $(swapon --show=SIZE --noheadings | head -1 | tr -d ' ')"
echo " 内存         : $(free -h | awk '/^Mem:/{print $3" 已用 / "$2" 总计"}')"
echo " 磁盘         : $(df -h / | awk 'NR==2{print $3" 已用 / "$2" 总计"}')"
echo " 公网 IP      : $(curl -s --max-time 5 https://api.ipify.org || echo '取不到，检查出网')"
echo "=============================================="
echo ""
echo "下一步："
echo "  1) 把域名 A 记录指到上面的公网 IP（先别开 Cloudflare 代理，等证书签完再开）"
echo "  2) 本地执行：bash deploy/overseas/deploy.sh backend"
echo "  3) 写 server/.env（参考 deploy/overseas/env.example），再 bash deploy/overseas/deploy.sh tls"
