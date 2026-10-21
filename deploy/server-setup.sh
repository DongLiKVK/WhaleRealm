#!/usr/bin/env bash
#
# 鲸域 · 服务器初始化脚本
# 目标环境：腾讯云轻量应用服务器 / Ubuntu 22.04 LTS / 2核4G
#
# 用法：
#   sudo bash server-setup.sh
#
# 幂等：可以重复执行，不会重复安装或破坏已有配置。

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[X]${NC} $*" >&2; }

# 任何一步失败都打印出错行号，避免静默中止
trap 'err "第 ${LINENO} 行执行失败，脚本中止。上行命令：${BASH_COMMAND}"' ERR

if [[ $EUID -ne 0 ]]; then
  err "请用 sudo 运行：sudo bash server-setup.sh"
  exit 1
fi

APP_USER="jingyu"
APP_DIR="/var/www/jingyu"
NODE_MAJOR="20"
SWAP_SIZE="2G"

echo "=============================================="
echo " 鲸域服务器初始化"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

# ---------- 1. 时区 ----------
timedatectl set-timezone Asia/Shanghai
info "时区设为 Asia/Shanghai（$(date '+%Z %z')）"

# ---------- 2. 系统更新 ----------
info "更新软件包索引..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

info "升级已安装的包..."
apt-get upgrade -y -qq

info "安装基础工具..."
apt-get install -y -qq \
  curl wget git vim htop unzip jq \
  build-essential ca-certificates gnupg \
  ufw fail2ban rsync >/dev/null
info "基础工具安装完成"

# ---------- 3. Node.js ----------
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

# ---------- 4. Nginx ----------
if command -v nginx >/dev/null 2>&1; then
  info "Nginx 已安装：$(nginx -v 2>&1 | cut -d/ -f2)"
else
  info "安装 Nginx..."
  apt-get install -y -qq nginx >/dev/null
  info "Nginx 安装完成：$(nginx -v 2>&1 | cut -d/ -f2)"
fi
systemctl enable nginx >/dev/null 2>&1
if ! systemctl restart nginx; then
  err "Nginx 启动失败，最近日志："
  journalctl -u nginx -n 15 --no-pager || true
  err "常见原因：80/443 被其它进程占用。用 sudo ss -tlnp | grep -E ':(80|443) ' 排查"
  exit 1
fi
info "Nginx 运行中"

# ---------- 5. 应用用户 ----------
if id "$APP_USER" &>/dev/null; then
  info "用户 $APP_USER 已存在"
else
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  info "创建系统用户 $APP_USER（无 sudo、无登录 shell）"
fi

# ubuntu 用户加入 jingyu 组，方便 rsync 部署
if id ubuntu &>/dev/null; then
  usermod -aG "$APP_USER" ubuntu
  info "已将 ubuntu 加入 $APP_USER 组"
fi

# ---------- 6. 目录结构 ----------
mkdir -p "$APP_DIR"/{dist,server,logs,uploads}
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod -R 775 "$APP_DIR"
info "应用目录就绪：$APP_DIR"

# ---------- 7. Swap ----------
if swapon --show | grep -q '/swapfile'; then
  info "Swap 已存在：$(swapon --show=SIZE --noheadings | head -1)"
else
  info "创建 ${SWAP_SIZE} Swap..."
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # 2核4G 内存不算宽裕，降低 swap 使用倾向
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  info "Swap 创建完成"
fi

# ---------- 8. 防火墙 ----------
info "配置 ufw..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
info "ufw 已启用：22 / 80 / 443"

# ---------- 9. fail2ban ----------
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

# ---------- 10. SSH 加固 ----------
# 注意：这一步会禁用密码登录。必须先确认密钥登录可用！
# 默认不自动执行，需要手动跑 deploy/harden-ssh.sh
warn "SSH 加固未自动执行，请确认密钥登录可用后再运行 harden-ssh.sh"

# ---------- 11. 内核参数 ----------
cat > /etc/sysctl.d/99-jingyu.conf <<'SYSCTL'
# 单机高并发场景的连接队列调优
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000
# 文件描述符上限（WebSocket 长连接需要）
fs.file-max = 200000
SYSCTL
sysctl -p /etc/sysctl.d/99-jingyu.conf >/dev/null
info "内核参数已优化（连接队列 / 端口范围 / 文件句柄）"

# ---------- 12. 汇总 ----------
echo ""
echo "=============================================="
echo -e "${GREEN} 初始化完成${NC}"
echo "=============================================="
echo " Node.js   : $(node -v)"
echo " npm       : $(npm -v)"
echo " Nginx     : $(nginx -v 2>&1 | cut -d/ -f2)"
echo " 应用目录  : $APP_DIR"
echo " 运行用户  : $APP_USER"
echo " 时区      : $(timedatectl show -p Timezone --value)"
echo " Swap      : $(swapon --show=SIZE --noheadings | head -1 | tr -d ' ')"
echo " 内存      : $(free -h | awk '/^Mem:/{print $3" 已用 / "$2" 总计"}')"
echo " 磁盘      : $(df -h / | awk 'NR==2{print $3" 已用 / "$2" 总计"}')"
echo "=============================================="
