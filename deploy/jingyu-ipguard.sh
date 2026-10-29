#!/usr/bin/env bash
# ============================================================================
# jingyu-ipguard —— 让「谁免于被本机防护锁在门外」自动跟随当前出口 IP
#   维护对象：/etc/fail2ban/jail.local 的 [DEFAULT] ignoreip
#   真相来源：SSH 会话的 $SSH_CLIENT（服务器亲眼看到的来源 IP，最权威）
#   可选联动：腾讯云轻量防火墙 22/443 放行源，需 /etc/jingyu-ipguard/tc.json
# 版本：1.1    2026-10-29
# ============================================================================
set -uo pipefail

VERSION="1.1"
STATE_DIR="/var/lib/jingyu-ipguard"
OWNER_LIST="$STATE_DIR/owner.list"
LAST_SYNC="$STATE_DIR/last-sync"
BACKUP_DIR="$STATE_DIR/backup"
LOG="/var/log/jingyu-ipguard.log"
JAIL_CONF="/etc/fail2ban/jail.local"
SG_HELPER="/usr/local/sbin/jingyu-ipguard-sg"
CRED_FILE="/etc/jingyu-ipguard/tc.json"

# 永久白名单：本机回环 + 服务器自己的公网 IP（服务器永远不封自己）
BASE_IGNORE="127.0.0.1/8 ::1 43.142.153.74"
MAX_OWNER_IPS=5
KEEP_BACKUPS=20

if [ -t 1 ]; then C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'; else C_OK=""; C_ERR=""; C_OFF=""; fi

log()  { printf '%s %s\n' "$(date -Is)" "$*" >>"$LOG" 2>/dev/null; }
info() { printf '%s\n' "$*"; log "INFO  $*"; }
err()  { printf '%s%s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; log "ERROR $*"; }
die()  { err "$*"; exit 1; }

ensure_state() {
  mkdir -p "$STATE_DIR" "$BACKUP_DIR" || die "无法创建状态目录 $STATE_DIR（需要 root）"
  [ -f "$OWNER_LIST" ] || : >"$OWNER_LIST"
  touch "$LOG" 2>/dev/null || true
}

valid_ip() { python3 -c 'import ipaddress,sys; ipaddress.ip_address(sys.argv[1])' "$1" >/dev/null 2>&1; }
is_private_ip() { python3 -c 'import ipaddress,sys; sys.exit(0 if ipaddress.ip_address(sys.argv[1]).is_private else 1)' "$1" >/dev/null 2>&1; }
client_ip() { local c; c=$(printenv SSH_CLIENT 2>/dev/null); printf '%s' "$c" | awk '{print $1}'; }

read_owner() { grep -vE '^[[:space:]]*(#|$)' "$OWNER_LIST" 2>/dev/null | tr -d ' \r' | awk 'NF && !seen[$0]++'; }
is_owner() { read_owner | grep -qxF "$1"; }

write_owner() {
  local tmp; tmp=$(mktemp)
  printf '%s\n' "$@" >"$tmp"
  grep -vE '^[[:space:]]*$' "$tmp" >"$tmp.a" && mv "$tmp.a" "$tmp"
  local total; total=$(wc -l <"$tmp")
  if [ "$total" -gt "$MAX_OWNER_IPS" ]; then
    tail -n "$MAX_OWNER_IPS" "$tmp" >"$tmp.b" && mv "$tmp.b" "$tmp"
  fi
  install -m 600 "$tmp" "$OWNER_LIST"; rm -f "$tmp"
}

current_ignoreip() {
  grep -E '^[[:space:]]*ignoreip[[:space:]]*=' "$JAIL_CONF" 2>/dev/null | head -1 | sed -E 's/^[[:space:]]*ignoreip[[:space:]]*=[[:space:]]*//'
}

backup_conf() {
  local ts; ts=$(date +%Y%m%d-%H%M%S)
  cp -a "$JAIL_CONF" "$BACKUP_DIR/jail.local.$ts" 2>/dev/null && info "已备份 jail.local → $BACKUP_DIR/jail.local.$ts"
  ls -1t "$BACKUP_DIR"/jail.local.* 2>/dev/null | tail -n +$(( KEEP_BACKUPS + 1 )) | xargs -r rm -f
}

render_ignoreip() {
  local owners; owners=$(read_owner | tr '\n' ' ')
  printf '%s %s' "$BASE_IGNORE" "$owners" | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//'
}

write_ignoreip() {
  local line="$1"
  python3 - "$JAIL_CONF" "$line" <<'PY' || return 1
import re, sys
path, line = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    lines = fh.read().splitlines()
out, done = [], False
for l in lines:
    if re.match(r"^\s*ignoreip\s*=", l):
        if not done:
            out.append("ignoreip = " + line)
            done = True
        continue
    out.append(l)
if not done:
    out.insert(0, "ignoreip = " + line)
with open(path, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
print("ok")
PY
}

fail2ban_jails() {
  fail2ban-client status 2>/dev/null | grep -oP 'Jail list:[[:space:]]*\K.*' | tr ',' ' ' | tr -d '\t'
}

unban_everywhere() {
  local ip="$1" j n=0
  for j in $(fail2ban_jails); do
    if fail2ban-client set "$j" unbanip "$ip" >/dev/null 2>&1; then n=$(( n + 1 )); fi
  done
  if [ "$n" -gt 0 ]; then info "已在 $n 个 jail 上尝试解封 $ip"; fi
  return 0
}

reload_fail2ban() {
  if ! fail2ban-client -t >/tmp/jingyu-ipguard-test 2>&1; then
    err "配置校验失败，准备回滚："; sed 's/^/    /' /tmp/jingyu-ipguard-test >&2
    local latest; latest=$(ls -1t "$BACKUP_DIR"/jail.local.* 2>/dev/null | head -1)
    if [ -n "$latest" ]; then cp -a "$latest" "$JAIL_CONF" && err "已从 $latest 还原"; fi
    return 1
  fi
  if ! fail2ban-client reload >/tmp/jingyu-ipguard-reload 2>&1; then
    err "fail2ban reload 失败："; sed 's/^/    /' /tmp/jingyu-ipguard-reload >&2; return 1
  fi
  info "fail2ban 已重载，新白名单立即生效"
}

apply_all() {
  local line cur
  line=$(render_ignoreip)
  cur=$(current_ignoreip)
  if [ "$cur" = "$line" ]; then
    info "ignoreip 已是目标值（$line），跳过重写与重载"
  else
    backup_conf
    write_ignoreip "$line" >/dev/null || die "写入 $JAIL_CONF 失败"
    info "ignoreip → $line"
    reload_fail2ban || return 1
  fi
  local ip
  for ip in $(read_owner); do unban_everywhere "$ip"; done
  date -Is >"$LAST_SYNC"
  return 0
}

cmd_show() {
  ensure_state
  printf '%s\n' "== ignoreip（当前生效配置）=="
  printf '  %s\n' "$(current_ignoreip)"
  printf '%s\n' "== 属主 IP 列表（自动维护：$OWNER_LIST）=="
  if [ -s "$OWNER_LIST" ]; then sed 's/^/  /' "$OWNER_LIST"; else printf '%s\n' "  (空)"; fi
  printf '%s\n' "== 最近一次同步 =="
  if [ -f "$LAST_SYNC" ]; then printf '  %s\n' "$(cat "$LAST_SYNC")"; else printf '%s\n' "  (从未)"; fi
  printf '%s\n' "== 各 jail 当前封禁数 =="
  local j cur
  for j in $(fail2ban_jails); do
    cur=$(fail2ban-client status "$j" 2>/dev/null | grep -oP 'Currently banned:[[:space:]]*\K[0-9]+' | head -1)
    printf '  %-20s %s\n' "$j" "$cur"
  done
  printf '%s\n' "== 云防火墙联动 =="
  if [ -x "$SG_HELPER" ] && [ -f "$CRED_FILE" ]; then printf '  已启用（密钥 %s）\n' "$CRED_FILE"; else printf '  未启用（缺密钥 %s）\n' "$CRED_FILE"; fi
}

cmd_whoami() {
  ensure_state
  local ip; ip=$(client_ip)
  printf 'source_ip=%s\n' "$ip"
  if [ -n "$ip" ] && is_owner "$ip"; then printf 'whitelisted=yes\n'; else printf 'whitelisted=no\n'; fi
  printf 'ignoreip=%s\n' "$(current_ignoreip)"
}

cmd_set_auto() {
  ensure_state
  local quiet=0 ip="" a
  for a in "$@"; do
    case "$a" in
      --quiet) quiet=1 ;;
      *) ip=$a ;;
    esac
  done
  if [ -z "$ip" ]; then ip=$(client_ip); fi
  if [ -z "$ip" ]; then err "取不到来源 IP（不在 SSH 会话里，也没给参数）"; return 2; fi
  valid_ip "$ip" || { err "非法 IP：$ip"; return 2; }
  if is_private_ip "$ip"; then
    printf 'IPGUARD_STATUS=skip ip=%s reason=private\n' "$ip"; return 0
  fi
  if is_owner "$ip"; then
    if [ "$quiet" = 0 ]; then info "$ip 已在白名单，无需改动"; fi
    printf 'IPGUARD_STATUS=unchanged ip=%s\n' "$ip"
    return 0
  fi
  write_owner $(read_owner) "$ip"
  info "检测到新的出口 IP：$ip，正在更新白名单"
  apply_all || return 1
  if [ -x "$SG_HELPER" ] && [ -f "$CRED_FILE" ]; then
    info "— 同步腾讯云防火墙（22/443 放行源）—"
    "$SG_HELPER" apply "$ip" || err "云防火墙同步失败（fail2ban 白名单不受影响）"
  fi
  printf 'IPGUARD_STATUS=added ip=%s\n' "$ip"
}

cmd_set() {
  ensure_state
  if [ $# -lt 1 ]; then die "用法：jingyu-ipguard set <ip> [ip...]"; fi
  local ip last=""
  for ip in "$@"; do valid_ip "$ip" || die "非法 IP：$ip"; last="$ip"; done
  write_owner "$@"
  info "属主 IP 列表 → $(tr '\n' ' ' <"$OWNER_LIST" | sed -E 's/[[:space:]]+$//')"
  apply_all || exit 1
  if [ -x "$SG_HELPER" ] && [ -f "$CRED_FILE" ]; then
    info "— 同步腾讯云防火墙（22/443 放行源）—"
    "$SG_HELPER" apply "$last" || err "云防火墙同步失败（fail2ban 白名单不受影响）"
  fi
  info "完成：$last 已免于本机封禁"
}

cmd_add() {
  ensure_state
  if [ $# -lt 1 ]; then die "用法：jingyu-ipguard add <ip> [ip...]"; fi
  local ip
  for ip in "$@"; do valid_ip "$ip" || die "非法 IP：$ip"; done
  write_owner $(read_owner) "$@"
  apply_all || exit 1
  info "完成：追加 $*"
}

cmd_del() {
  ensure_state
  if [ $# -lt 1 ]; then die "用法：jingyu-ipguard del <ip>"; fi
  local tmp; tmp=$(mktemp)
  local ip x skip
  while read -r ip; do
    [ -z "$ip" ] && continue
    skip=0
    for x in "$@"; do if [ "$ip" = "$x" ]; then skip=1; fi; done
    if [ "$skip" = 0 ]; then printf '%s\n' "$ip" >>"$tmp"; fi
  done < <(read_owner)
  install -m 600 "$tmp" "$OWNER_LIST"; rm -f "$tmp"
  apply_all || exit 1
  info "完成：移除 $*"
}

cmd_unban() {
  if [ $# -lt 1 ]; then die "用法：jingyu-ipguard unban <ip>"; fi
  valid_ip "$1" || die "非法 IP：$1"
  unban_everywhere "$1"
  info "完成：$1 已在全部 jail 解封（白名单未改动）"
}

cmd_sg() {
  if [ ! -x "$SG_HELPER" ]; then die "缺少 $SG_HELPER"; fi
  exec "$SG_HELPER" "$@"
}

usage() {
  cat <<'USAGE'
jingyu-ipguard —— 出口 IP 自动跟随（fail2ban 白名单 + 可选的云防火墙）

  jingyu-ipguard show                 查看白名单、各 jail 封禁数、联动状态
  jingyu-ipguard whoami               看服务器认为你从哪个 IP 来、是否已免封
  jingyu-ipguard set-auto [--quiet]   以本次 SSH 来源 IP 自动同步（客户端定时任务用这个）
  jingyu-ipguard set <ip> [ip...]     用给定 IP 覆盖属主白名单
  jingyu-ipguard add <ip>             追加 IP（例如手机热点 IP），保留已有
  jingyu-ipguard del <ip>             移除 IP
  jingyu-ipguard unban <ip>           只在全部 jail 解封，不改白名单
  jingyu-ipguard sg show|apply <ip>   腾讯云轻量防火墙（需 /etc/jingyu-ipguard/tc.json）
  jingyu-ipguard -h | --version
USAGE
}

main() {
  local cmd="show"
  if [ $# -gt 0 ]; then cmd=$1; shift; fi
  case "$cmd" in
    show|status)     cmd_show ;;
    whoami)          cmd_whoami ;;
    set-auto|sync)   cmd_set_auto "$@" ;;
    set)             cmd_set "$@" ;;
    add)             cmd_add "$@" ;;
    del|remove)      cmd_del "$@" ;;
    unban)           cmd_unban "$@" ;;
    sg)              cmd_sg "$@" ;;
    -h|--help|help)  usage ;;
    --version|-V)    echo "jingyu-ipguard $VERSION" ;;
    *)               usage; exit 2 ;;
  esac
}
main "$@"
