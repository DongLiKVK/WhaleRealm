#!/usr/bin/env bash
# ============================================================================
# jingyu-attack-watch —— 鲸域攻击期实时监控（2026-10-29 上线）
#
#   sudo jingyu-attack-watch                      10 秒一次，只报数
#   sudo jingyu-attack-watch --interval 5         改采样间隔
#   sudo jingyu-attack-watch --auto               压力持续超标自动切 ATTACK 档，回落自动切回
#   sudo jingyu-attack-watch --auto-ban 150       单个窗口内某 IP 超 150 次即自动封禁
#   sudo jingyu-attack-watch --once               只跑一轮
#   sudo jingyu-attack-watch --rps 60             自动切档的 RPS 阈值（默认 30）
#
# 每行含义：tot 本轮请求 / rps 折算每秒 / 429 被限流 / 444 被丢弃 /
#           403 封禁命中 / 5xx 后端或超时 / bw 本轮字节 / 热点IP
# ============================================================================
set -uo pipefail

ACC=/var/log/nginx/access.log
INTERVAL=10
AUTO_MODE=0
AUTO_BAN=0
BAN_THRESH=0
RPS_TRIGGER=30
ONCE=0
DEF=/usr/local/sbin/jingyu-defense
MODE_STATE=/etc/jingyu-defense.mode
CHUNK=/tmp/jingyu-watch-chunk.$$

usage() { sed -n '3,16p' "$0"; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --interval) INTERVAL="$2"; shift 2 ;;
        --auto)     AUTO_MODE=1; shift ;;
        --auto-ban) AUTO_BAN=1; BAN_THRESH="$2"; shift 2 ;;
        --rps)      RPS_TRIGGER="$2"; shift 2 ;;
        --once)     ONCE=1; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)          printf '未知参数: %s\n' "$1" >&2; usage; exit 2 ;;
    esac
done

mode_now() { if [ -f "$MODE_STATE" ]; then cat "$MODE_STATE"; else echo normal; fi; }

printf '==== 鲸域实时监控 %s ====\n' "$(date '+%F %T')"
printf '日志 %s  间隔 %ss  自动切档 %s  自动封禁 %s（阈值 %s/窗口）  当前档位 %s\n' \
    "$ACC" "$INTERVAL" "$AUTO_MODE" "$AUTO_BAN" "$BAN_THRESH" "$(mode_now)"
printf '%s\n' '-------------------------------------------------------------------------------'
printf '%-9s %6s %6s %5s %5s %5s %5s %10s %-22s\n' 时间 tot rps 429 444 403 5xx 字节 热点IP

# 首轮从文件末尾起算，避免把历史日志当成第一个窗口（否则 --once 会报出几百 rps 的假峰值）
last_size="$(stat -c %s "$ACC" 2>/dev/null || echo 0)"
last_inode="$(stat -c %i "$ACC" 2>/dev/null || echo 0)"
hot=0
quiet=0

while :; do
    inode="$(stat -c %i "$ACC" 2>/dev/null || echo 0)"
    size="$(stat -c %s "$ACC" 2>/dev/null || echo 0)"
    if [ "$inode" != "$last_inode" ] || [ "$size" -lt "$last_size" ]; then
        last_size=0
        last_inode="$inode"
    fi
    start=$((last_size + 1))
    len=$((size - last_size))
    last_size="$size"

    if [ "$len" -le 0 ]; then
        printf '%-9s %6s %6s %5s %5s %5s %5s %10s %-22s\n' "$(date '+%H:%M:%S')" 0 0 0 0 0 0 0 "（无流量）"
        hot=0
        quiet=$((quiet + 1))
        if [ "$AUTO_MODE" -eq 1 ] && [ "$quiet" -ge 18 ] && [ "$(mode_now)" = "attack" ]; then
            printf '[%s] 连续 %s 个窗口静默 —— 自动切回 NORMAL\n' "$(date '+%H:%M:%S')" "$quiet"
            "$DEF" off >/dev/null 2>&1 || true
            quiet=0
        fi
    else
        quiet=0
        tail -c +"$start" "$ACC" 2>/dev/null | head -c "$len" > "$CHUNK" 2>/dev/null || true

        out="$(awk -F'"' -v iv="$INTERVAL" -v ts="$(date '+%H:%M:%S')" '
            NF > 2 {
                split($1, pre, " "); ip = pre[1];
                split($3, post, " "); st = post[1]; by = post[2];
                tot++; cnt[st]++; seen[ip]++; bw += by;
            }
            END {
                top = "-"; topn = 0;
                for (k in seen) if (seen[k] > topn) { topn = seen[k]; top = k }
                printf "%-9s %6d %6.1f %5d %5d %5d %5d %10d %-22s\n", ts, tot + 0, (iv > 0 ? tot / iv : tot), \
                    cnt["429"] + 0, cnt["444"] + 0, cnt["403"] + 0, \
                    cnt["504"] + cnt["502"] + cnt["499"] + 0, bw + 0, top ":" topn;
                if (tot >= 0) printf "RPSVAL %.2f\n", (iv > 0 ? tot / iv : tot);
            }' "$CHUNK" 2>/dev/null || true)"

        printf '%s\n' "$out" | grep -v '^RPSVAL'
        rps="$(printf '%s\n' "$out" | awk '/^RPSVAL/ {print $2; exit}')"
        [ -n "$rps" ] || rps=0

        if [ "$AUTO_BAN" -eq 1 ] && [ "$BAN_THRESH" -gt 0 ]; then
            awk -F'"' -v th="$BAN_THRESH" '
                NF > 2 { split($1,pre," "); ip=pre[1]; seen[ip]++ }
                END { for (k in seen) if (seen[k] >= th) print k, seen[k] }' "$CHUNK" |
            while read -r bip bcnt; do
                printf '  >>> 自动封禁 %s（本窗口 %s 次）\n' "$bip" "$bcnt"
                "$DEF" ban "$bip" >/dev/null 2>&1 || true
            done
        fi

        if [ "$AUTO_MODE" -eq 1 ]; then
            over="$(awk -v r="$rps" -v t="$RPS_TRIGGER" 'BEGIN { print ((r + 0) >= (t + 0)) ? 1 : 0 }')"
            if [ "$over" = "1" ]; then
                hot=$((hot + 1))
                if [ "$hot" -ge 3 ] && [ "$(mode_now)" = "normal" ]; then
                    printf '[%s] 连续 %s 个窗口 RPS ≥ %s —— 自动切 ATTACK 档\n' "$(date '+%H:%M:%S')" "$hot" "$RPS_TRIGGER"
                    "$DEF" on >/dev/null 2>&1 || true
                    hot=0
                fi
            else
                hot=0
            fi
        fi
    fi

    [ "$ONCE" -eq 1 ] && break
    sleep "$INTERVAL"
done

rm -f "$CHUNK"
