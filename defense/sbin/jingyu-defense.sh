#!/usr/bin/env bash
# ============================================================================
# jingyu-defense —— 鲸域一键防护开关 / 封禁管理（2026-10-29 攻击测试期上线）
#
#   sudo jingyu-defense status            档位 + 封禁名单 + fail2ban + 近 5 分钟压力
#   sudo jingyu-defense on                切 ATTACK 档（每 IP 6 连接 / 10 秒 10 请求）
#   sudo jingyu-defense off               切回 NORMAL 档（每 IP 24 连接 / 10r/s）
#   sudo jingyu-defense ban 1.2.3.4       拉黑 IP（geo 名单，立即 403）
#   sudo jingyu-defense ban 1.2.3.0/24    拉黑网段（geo 支持 CIDR）
#   sudo jingyu-defense unban 1.2.3.4     解除
#   sudo jingyu-defense list              列出名单
#   sudo jingyu-defense watch [参数]      转实时监控 jingyu-attack-watch
#   sudo jingyu-defense test              只跑 nginx -t，不动线上
#
# 安全：改动先落 .new → nginx -t → 失败自动回滚 → 成功才 reload；
#       每次改动在 /var/backups/jingyu-defense/<时间戳>/ 留一份原件。
# ============================================================================
set -euo pipefail

SNIP_DIR=/etc/nginx/snippets
MODE_FILE="$SNIP_DIR/shield-mode.conf"
STRICT_FILE="$SNIP_DIR/shield-strict-loc.conf"
BLOCK_FILE=/etc/nginx/blocked_ips.conf
MODE_STATE=/etc/jingyu-defense.mode
LOG_FILE=/var/log/jingyu-defense.log
BK_DIR=/var/backups/jingyu-defense
ALERT_PY=/usr/local/sbin/jingyu-alert.py
WATCH_BIN=/usr/local/sbin/jingyu-attack-watch
ACC_LOG=/var/log/nginx/access.log

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; printf '%s\n' "$*"; }
die() { printf '错误: %s\n' "$*" >&2; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "需要 root，请用 sudo"; }
# 用法：alert "主题" "正文"；告警器接口是 --subject + stdin 正文（不带 --subject 会被当成参数错误）
alert() {
    if [ -x "$ALERT_PY" ]; then
        local subj="$1"; shift || true
        printf '%s\n' "$*" | python3 "$ALERT_PY" --subject "$subj" --key jingyu-defense >/dev/null 2>&1 || true
    fi
}

get_mode() {
    if [ -f "$MODE_STATE" ]; then
        cat "$MODE_STATE"
    elif grep -q site_burst_strict "$MODE_FILE" 2>/dev/null; then
        echo attack
    else
        echo normal
    fi
}

backup_now() {
    local d
    d="$BK_DIR/$(date '+%Y%m%d-%H%M%S')"
    mkdir -p "$d" && chmod 700 "$d"
    [ -f "$MODE_FILE" ]   && cp -a "$MODE_FILE"   "$d/shield-mode.conf"
    [ -f "$STRICT_FILE" ] && cp -a "$STRICT_FILE" "$d/shield-strict-loc.conf"
    [ -f "$BLOCK_FILE" ]  && cp -a "$BLOCK_FILE"  "$d/blocked_ips.conf"
    printf '%s' "$d"
}

nginx_apply() {
    if nginx -t >/tmp/jingyu-defense-nginxt.log 2>&1; then
        systemctl reload nginx
        return 0
    fi
    printf '\n--- nginx -t 输出 ---\n' >&2
    cat /tmp/jingyu-defense-nginxt.log >&2
    return 1
}

write_mode_files() {
    local mode="$1"
    if [ "$mode" = "attack" ]; then
        cat > "$MODE_FILE.new" <<'NGX'
# ============================================================================
# snippets/shield-mode.conf —— server 级限流档位（由 jingyu-defense 切换）
# 当前档位：ATTACK —— 每 IP 最多 6 条并发连接、10 秒 10 个请求，超出即 429
# ============================================================================
limit_conn       conn_all 6;
limit_req        zone=site_burst_strict burst=10 nodelay;
limit_req_status  429;
limit_conn_status 429;
NGX
        cat > "$STRICT_FILE.new" <<'NGX'
# snippets/shield-strict-loc.conf —— ATTACK 档：各 location 内叠加 1r/s 硬限流
limit_req zone=site_burst_strict burst=4 nodelay;
NGX
    else
        cat > "$MODE_FILE.new" <<'NGX'
# ============================================================================
# snippets/shield-mode.conf —— server 级限流档位（由 jingyu-defense 切换）
# 当前档位：NORMAL
# ============================================================================
limit_conn       conn_all 24;
limit_req        zone=site_burst burst=120 nodelay;
limit_req_status  429;
limit_conn_status 429;
NGX
        cat > "$STRICT_FILE.new" <<'NGX'
# snippets/shield-strict-loc.conf —— NORMAL 档：只有注释，不追加任何限制
NGX
    fi
}

set_mode() {
    local mode="$1" bk
    need_root
    if [ "$(get_mode)" = "$mode" ]; then log "已经是 $mode 档，无需切换"; return 0; fi
    bk="$(backup_now)"
    write_mode_files "$mode"
    mv "$MODE_FILE.new" "$MODE_FILE"
    mv "$STRICT_FILE.new" "$STRICT_FILE"
    if nginx_apply; then
        printf '%s\n' "$mode" > "$MODE_STATE"
        log "防护档位 → $mode（备份 $bk）"
        alert "鲸域防护档位切换: $mode" "jingyu-defense 已把防护档位切换到 $mode。\n时间: $(date '+%F %T')\n查看: sudo jingyu-defense status"
        return 0
    fi
    cp -a "$bk/shield-mode.conf" "$MODE_FILE" 2>/dev/null || true
    cp -a "$bk/shield-strict-loc.conf" "$STRICT_FILE" 2>/dev/null || true
    systemctl reload nginx 2>/dev/null || true
    die "nginx -t 失败，已回滚（备份 $bk）"
}

ban_ip() {
    local ip="$1" bk
    [ -n "$ip" ] || die "用法: jingyu-defense ban <ip|cidr>"
    printf '%s' "$ip" | grep -Eq '^[0-9a-fA-F:.]+(/[0-9]{1,3})?$' || die "IP 格式不对: $ip"
    need_root
    if grep -qF "$ip 1;" "$BLOCK_FILE"; then log "已在名单中: $ip"; return 0; fi
    bk="$(backup_now)"
    printf '%s 1;  # %s\n' "$ip" "$(date '+%F %T') jingyu-defense" >> "$BLOCK_FILE"
    if nginx_apply; then
        log "已封禁 $ip"
        alert "鲸域封禁 IP: $ip" "已在 nginx geo 层封禁 $ip（返回 403）。\n解除: sudo jingyu-defense unban $ip"
        return 0
    fi
    cp -a "$bk/blocked_ips.conf" "$BLOCK_FILE"
    systemctl reload nginx 2>/dev/null || true
    die "nginx -t 失败，已回滚封禁名单"
}

unban_ip() {
    local ip="$1" bk
    [ -n "$ip" ] || die "用法: jingyu-defense unban <ip|cidr>"
    need_root
    grep -qF "$ip 1;" "$BLOCK_FILE" || { log "名单里没有 $ip"; return 0; }
    bk="$(backup_now)"
    grep -vF "$ip 1;" "$BLOCK_FILE" > "$BLOCK_FILE.new" || true
    mv "$BLOCK_FILE.new" "$BLOCK_FILE"
    chmod 644 "$BLOCK_FILE"
    if nginx_apply; then log "已解封 $ip"; return 0; fi
    cp -a "$bk/blocked_ips.conf" "$BLOCK_FILE"
    systemctl reload nginx 2>/dev/null || true
    die "nginx -t 失败，已回滚封禁名单"
}

list_banned() {
    local n
    n="$(grep -v '^[[:space:]]*#' "$BLOCK_FILE" 2>/dev/null | grep -c '1;' || true)"
    [ -n "$n" ] || n=0
    printf '封禁名单: %s 条  (%s)\n' "$n" "$BLOCK_FILE"
    grep -v '^[[:space:]]*#' "$BLOCK_FILE" 2>/dev/null | grep '1;' | sed 's/^/  /' || true
}

show_status() {
    local tmp j out
    printf '==== 鲸域防护状态 %s ====\n' "$(date '+%F %T')"
    printf '档位模式 : %s\n' "$(get_mode)"
    printf 'nginx    : %s\n' "$(nginx -v 2>&1)"
    printf '服务状态 : %s\n' "$(systemctl is-active nginx)"
    printf '工作进程 : %s\n' "$(pgrep -c nginx || echo 0)"
    printf 'ESTAB 连接: %s\n' "$(ss -H -tan state established 2>/dev/null | wc -l)"
    printf '\n---- 封禁名单 ----\n'
    list_banned
    printf '\n---- fail2ban ----\n'
    for j in sshd sshd-ddos nginx-badreq nginx-404scan nginx-limit-req jingyu-shield jingyu-ratelimit jingyu-login; do
        out="$(fail2ban-client status "$j" 2>/dev/null | grep -E 'Currently banned|Total banned' | tr -s ' ' | tr '\n' ' ' || true)"
        if [ -n "$out" ]; then printf '  %-18s %s\n' "$j" "$out"; fi
    done
    printf '\n---- 近 5 分钟 access.log ----\n'
    tmp=/tmp/jingyu-defense-stats.$$
    tail -n 4000 "$ACC_LOG" > "$tmp" 2>/dev/null || : > "$tmp"
    awk -F'"' 'NF>2 { split($1,pre," "); split($3,post," "); st=post[1]; tot++
                 if (st=="429") a++; else if (st=="444") b++; else if (st=="403") c++
                 else if (st=="504"||st=="502"||st=="499") d++ }
               END { printf "  请求 %d   403 %d   429 %d   444 %d   5xx/499 %d\n", tot+0, c+0, a+0, b+0, d+0 }' "$tmp"
    awk '{print $1}' "$tmp" | sort | uniq -c | sort -rn | head -5 | awk '{printf "  热点 IP %-16s %s 次\n", $2, $1}'
    rm -f "$tmp"
    printf '\n高压档: sudo jingyu-defense on    实时监控: sudo jingyu-defense watch --auto\n'
}

case "${1:-status}" in
    on|attack)  set_mode attack ;;
    off|normal) set_mode normal ;;
    status)     show_status ;;
    ban)        ban_ip "${2:-}" ;;
    unban)      unban_ip "${2:-}" ;;
    list)       list_banned ;;
    test)       need_root; nginx -t ;;
    watch)      shift; exec "$WATCH_BIN" "$@" ;;
    *)          sed -n '3,17p' "$0" ;;
esac
