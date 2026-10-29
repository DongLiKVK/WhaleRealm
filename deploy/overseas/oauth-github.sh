#!/usr/bin/env bash
# 一次把 GitHub OAuth 配好并验证。
# 用法：bash deploy/overseas/oauth-github.sh <CLIENT_ID> <CLIENT_SECRET>
#       GH_CLIENT_ID=xxx GH_CLIENT_SECRET=yyy bash deploy/overseas/oauth-github.sh
#       bash deploy/overseas/oauth-github.sh --status        # 只看当前配置状态
# Client ID / Secret：GitHub → Settings → Developer settings → OAuth Apps 创建后拿到。
# Authorization callback URL 必须是：https://whalerealm.top/api/auth/oauth/github/callback
set -euo pipefail
HOST="${HOST:-158.247.215.153}"
SUSER="${SUSER:-root}"
KEY="${KEY:-$HOME/.ssh/jingyu_ed25519}"
DOMAIN="${DOMAIN:-whalerealm.top}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/jingyu}"
APP_USER="${APP_USER:-jingyu}"
SSH_CMD=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SUSER@$HOST")

show_status() {
  echo "--- providers（$DOMAIN） ---"
  curl -sS "https://$DOMAIN/api/auth/oauth/providers"; echo
  echo "--- 远端 .env 里 GitHub 行数 ---"
  "${SSH_CMD[@]}" "grep -c '^OAUTH_GITHUB_' $REMOTE_DIR/server/.env || true"
}

if [[ "${1:-}" == "--status" || "${1:-}" == "-s" ]]; then show_status; exit 0; fi

# 两个值既可以走位置参数，也可以走环境变量；空白裁掉，避免从网页复制时带上换行
ID="${1:-${GH_CLIENT_ID:-}}"
SECRET="${2:-${GH_CLIENT_SECRET:-}}"
ID="$(printf '%s' "$ID" | tr -d '[:space:]')"
SECRET="$(printf '%s' "$SECRET" | tr -d '[:space:]')"

# 占位符守卫：把教程里的 <CLIENT_ID> 原样粘进来、或者用 dummy 值时直接停在这里。
# 少了这道闸，一次误操作就会把假凭据写进生产 .env，登录按钮变成点了报 400 的坏按钮。
bad() { echo "✗ $1" >&2; echo "  真实值在 https://github.com/settings/developers → 你的 OAuth App → Client ID / Generate a new client secret" >&2; exit 1; }
[[ -n "$ID" && -n "$SECRET" ]] || bad "缺参数。用法：$0 <CLIENT_ID> <CLIENT_SECRET>（或 GH_CLIENT_ID/GH_CLIENT_SECRET 环境变量）"
[[ "$ID" == *"<"* || "$ID" == *">"* ]] && bad "Client ID 还是占位符：$ID"
[[ "$SECRET" == *"<"* || "$SECRET" == *">"* ]] && bad "Client Secret 还是占位符"
[[ "$ID" == CLIENT_ID* || "$ID" == DUMMY* ]] && bad "Client ID 看起来是示例值：$ID"
[[ "$SECRET" == *CLIENT_SECRET* || "$SECRET" == DUMMY* ]] && bad "Client Secret 看起来是示例值"
[[ ${#SECRET} -ge 20 ]] || bad "Client Secret 长度不对（GitHub 的是 40 位十六进制），是不是复制漏了"

"${SSH_CMD[@]}" "sudo sed -i '/^OAUTH_GITHUB_CLIENT_ID=/d;/^OAUTH_GITHUB_CLIENT_SECRET=/d' $REMOTE_DIR/server/.env"
printf 'OAUTH_GITHUB_CLIENT_ID=%s\nOAUTH_GITHUB_CLIENT_SECRET=%s\n' "$ID" "$SECRET" | "${SSH_CMD[@]}" "sudo tee -a $REMOTE_DIR/server/.env >/dev/null"
"${SSH_CMD[@]}" "sudo chown $APP_USER:$APP_USER $REMOTE_DIR/server/.env; sudo chmod 600 $REMOTE_DIR/server/.env; sudo systemctl restart jingyu; sleep 2; systemctl is-active jingyu"
echo "--- providers ---"
curl -sS "https://$DOMAIN/api/auth/oauth/providers"; echo
echo "已写入。登录页刷新即出现 GitHub 按钮。回滚：ssh $SUSER@$HOST \"sed -i '/^OAUTH_GITHUB_/d' $REMOTE_DIR/server/.env && systemctl restart jingyu\""
