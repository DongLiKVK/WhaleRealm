#!/usr/bin/env bash
# 鲸域 · 防护守卫（一次巡检；由 jingyu-defense-guard.timer 每 2 分钟拉起）
# 按字节增量读 access.log，统计 444/429/403/5xx 与热点 IP；命中攻击指纹即告警并自动切高压档。
set -uo pipefail

ACC=/var/log/nginx/access.log
STATE_DIR=/var/lib/jingyu-defense
STATE="$STATE_DIR/guard.state"
LOG=/var/log/jingyu-defense.log
ALERT=/usr/local/sbin/jingyu-alert.py
DEF=/usr/local/sbin/jingyu-defense
MODE_FILE=/etc/jingyu-defense.mode

RPS_ALERT=30        # 每秒请求数达到该值就告警（可能是攻击，也可能是爆红）
CRIT_444=30         # 窗口内 444（扫描器/注入被掐）达到该值 → 判定为攻击
CRIT_429=200        # 窗口内 429（限流触发）达到该值 → 判定为攻击
CRIT_HOT=300        # 单一 IP 窗口内请求数

log() { printf '%s [guard] %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

need_root() { [ "$(id -u)" = 0 ] || { echo 'need root'; exit 1; }; }
need_root
mkdir -p "$STATE_DIR" || exit 0

now=$(date +%s)
prev_off=0
prev_time=0
if [ -s "$STATE" ]; then
  prev_off=$(awk 'NR==1{print $1}' "$STATE")
  prev_time=$(awk 'NR==1{print $2}' "$STATE")
fi
[ -z "$prev_off" ] && prev_off=0
[ -z "$prev_time" ] && prev_time=0
size=$(stat -c %s "$ACC" 2>/dev/null || echo 0)

# 首次运行 / 日志被轮转 / 时间倒退：只记基线，不判定
if [ "$prev_time" = 0 ] || [ "$size" -lt "$prev_off" ]; then
  printf '%s %s\n' "$size" "$now" > "$STATE"
  log "基线初始化 offset=$size"
  exit 0
fi

span=$((now - prev_time))
[ "$span" -lt 1 ] && span=1
[ "$span" -gt 1800 ] && span=1800   # 停机很久回来时，按最多 30 分钟归一

len=$((size - prev_off))
if [ "$len" -le 0 ]; then
  printf '%s %s\n' "$size" "$now" > "$STATE"
  exit 0
fi

stats=$(tail -c "+$((prev_off + 1))" "$ACC" 2>/dev/null | head -c "$len" | awk -F'"' '
  {
    split($1, a, " "); ip = a[1]
    split($3, b, " "); st = b[1]
    tot++; c[st]++
    if (st ~ /^5/ || st == "499") e5++
    h[ip]++
  }
  END {
    top = "-"; topn = 0
    for (k in h) if (h[k] > topn) { topn = h[k]; top = k }
    printf "%d %d %d %d %d %s %d\n", tot+0, c["444"]+0, c["429"]+0, c["403"]+0, e5+0, top, topn+0
  }')

printf '%s %s\n' "$size" "$now" > "$STATE"
set -- $stats
tot=${1:-0}; n444=${2:-0}; n429=${3:-0}; n403=${4:-0}; e5=${5:-0}; topip=${6:--}; topn=${7:-0}
rps=$((tot * 60 / span))
[ "$rps" -gt 0 ] || true

log "window=${span}s tot=${tot} rps=${rps} 444=${n444} 429=${n429} 403=${n403} 5xx=${e5} top=${topip}:${topn}"

alert() {
  local subj="$1"; shift
  printf '%s\n' "$*" | python3 "$ALERT" --subject "$subj" --key defense-guard >/dev/null 2>&1 || true
}

attack=0
[ "$n444" -ge "$CRIT_444" ] && attack=1
[ "$n429" -ge "$CRIT_429" ] && attack=1

if [ "$attack" = 1 ]; then
  alert "鲸域告警：检测到攻击特征（${n444} 个 444 / ${n429} 个 429）" \
"窗口 ${span}s 内：请求 ${tot}（${rps} rps），444=${n444}，429=${n429}，403=${n403}，5xx/499=${e5}
热点 IP：${topip} 共 ${topn} 次

自动处置：切换高压档（如已是 attack 则跳过）
手动核查：sudo jingyu-defense status; sudo jingyu-attack-watch --once
封禁可疑 IP：sudo jingyu-defense ban <ip>"
  cur=$(cat "$MODE_FILE" 2>/dev/null | tr -d '[:space:]')
  if [ "$cur" != "attack" ]; then
    "$DEF" on >> "$LOG" 2>&1 && log "已自动切换至 attack 档" || log "自动切档失败"
  fi
elif [ "$rps" -ge "$RPS_ALERT" ] || [ "$topn" -ge "$CRIT_HOT" ]; then
  alert "鲸域提示：流量偏高（${rps} rps，热点 ${topip} × ${topn}）" \
"窗口 ${span}s 内：请求 ${tot}（${rps} rps），444=${n444}，429=${n429}，403=${n403}，5xx/499=${e5}
热点 IP：${topip} 共 ${topn} 次

若确认是攻击：sudo jingyu-defense on
若只是短时热点：无需处置，guard 每 2 分钟自动复检。"
  log "流量偏高已告警"
fi

exit 0
