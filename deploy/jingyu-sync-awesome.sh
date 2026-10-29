#!/usr/bin/env bash
#
# 鲸域 · 每日同步 awesome-dsh-plugin 目录
#
# 拉取为什么必须分块：
#   实测境内从该站（GitHub Pages 托管）下载只有 12–17 KB/s，
#   catalog.json 有 4,203,108 字节，一条 curl 跑到 60 秒必然断。
#   该站响应 accept-ranges: bytes，实测 --range 0-524287 返回 HTTP 206 且精确 524288 字节，
#   所以按 512KB 分块。单块按 15KB/s 约 35 秒，落在 45 秒超时内。
#
# 为什么全部写完 pending：
#   第三方目录元数据没过我们的合规筛查。直接 published 会把上次下架的
#   21 条高危条目（成人向 / 免杀 / 翻墙代理 / 白嫖账号池）原样灌回公开面，
#   等于把合规整改当场作废。进 pending，由后台「插件审核」页人工过。
#
# 关键取舍：任何一步失败都保留旧副本。宁可今天不更新，
# 也不让站点因为拿到半截 JSON 而读不出条目。

set -uo pipefail          # 注意：不要 set -e。脚本里大量「失败就当 0」的判断，
                          # set -e 会在 stat/算术表达式返回非零时直接退出，
                          # 这正是上一版每块都报「失败」的真实原因。

IMPORT_DIR=/var/lib/jingyu-import
CATALOG="$IMPORT_DIR/awesome-catalog.json"
PART="$IMPORT_DIR/awesome-catalog.part"
CHUNK_FILE="$IMPORT_DIR/awesome-catalog.chunk"
DB=/var/www/jingyu/server/data/jingyu.db
LOG=/var/log/jingyu-sync-awesome.log
URL='https://awesome-dsh-plugin.com/zh/catalog.json'
# 块大小为什么是 128KB 而不是 512KB：
#   实测 512KB 的块在后半段会拿不满（最后一块两次分别只到 519,723 / 126,561，期望 524,288），
#   说明单条连接传到一定字节数后被掐断，不是单纯速度慢。
#   降到 128KB、单块超时 30s，按 15KB/s 约 9 秒，余量充足；
#   代价是请求数变多（4.2MB / 128KB = 33 块），但每块间隔短，总时长反而更短。
CHUNK=$((128 * 1024))
MAX_CHUNKS=${MAX_CHUNKS:-80}

mkdir -p "$IMPORT_DIR"
log() { echo "[$(date -Is)] $*" >> "$LOG"; }
fsize() { stat -c%s "$1" 2>/dev/null | head -1; }

log 'sync start'

# ---------- ① 拉取 ----------
# 首选：经境外机中转。
#   实测境内直连该站（GitHub Pages 托管）只有 12–17 KB/s，4.2MB 要 8 分钟以上，
#   还得靠分块续传硬扛；而境外机 0.58 秒就拉完了。
#   所以只要境内能 SSH 到境外机，就让境外机去拉、再通过 SSH 管道传回来。
# 回退：SSH 不可用时分块续传（下面那套逻辑原样保留）。
RELAY_HOST=${RELAY_HOST:-158.247.215.153}
RELAY_KEY=${RELAY_KEY:-/home/ubuntu/.ssh/jingyu_ed25519}
RELAY_OK=0

if [[ -f "$RELAY_KEY" ]]; then
  if timeout 15 ssh -i "$RELAY_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
       -o ConnectTimeout=10 "root@$RELAY_HOST" 'echo ok' >/dev/null 2>&1; then
    log "境外中转可用（$RELAY_HOST），优先走中转"
    if timeout 120 ssh -i "$RELAY_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
         -o ConnectTimeout=10 "root@$RELAY_HOST" "curl -sS -m 90 '$URL'" > "$PART.relay" 2>/dev/null; then
      RSZ=$(fsize "$PART.relay"); RSZ=${RSZ:-0}
      if (( RSZ > 1000000 )) && python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$PART.relay" 2>/dev/null; then
        mv "$PART.relay" "$CATALOG"
        chown jingyu:jingyu "$CATALOG"; chmod 644 "$CATALOG"
        log "中转拉取成功（$RSZ 字节），跳过境内分块"
        RELAY_OK=1
      else
        log "中转拿到 $RSZ 字节但校验失败，回退分块续传"
        rm -f "$PART.relay"
      fi
    else
      log '中转传输失败，回退分块续传'
    fi
  else
    log '境外机不可达（SSH 失败），回退分块续传'
  fi
else
  log "未找到中转私钥 $RELAY_KEY，回退分块续传"
fi

# ---------- ①-b 分块续传（仅当上面的中转没成功时执行） ----------
if (( RELAY_OK == 0 )); then
TOTAL=$(curl -sS -I -m 25 "$URL" 2>/dev/null | tr -d '\r' | awk 'BEGIN{IGNORECASE=1} /^content-length:/{print $2}' | tail -1)
TOTAL=${TOTAL:-0}

if ! [[ "$TOTAL" =~ ^[0-9]+$ ]] || (( TOTAL <= 0 )); then
  log 'HEAD 未取到 content-length，跳过拉取，沿用旧副本'
else
  log "远端 $TOTAL 字节，块大小 $CHUNK"

  # 已有 .part 就续传；但若它比远端还大说明是脏数据，重来
  CUR=$(fsize "$PART"); CUR=${CUR:-0}
  (( CUR > TOTAL )) && { rm -f "$PART"; CUR=0; }
  log "已有 $CUR 字节，从该处续"

  OFF=$CUR
  FAILED=0
  N=0
  while (( OFF < TOTAL )); do
    N=$((N+1))
    (( N > MAX_CHUNKS )) && { log "达到块数上限 $MAX_CHUNKS，本轮停"; FAILED=1; break; }

    END=$(( OFF + CHUNK - 1 ))
    (( END >= TOTAL )) && END=$(( TOTAL - 1 ))
    NEED=$(( END - OFF + 1 ))

    rm -f "$CHUNK_FILE"
    # 单块：失败重试一次（两次都不成 → 本轮中止，.part 保留）
    GOT=0
    for TRY in 1 2 3; do
      curl -sS -m 30 --range "$OFF-$END" "$URL" -o "$CHUNK_FILE" 2>/dev/null
      GOT=$(fsize "$CHUNK_FILE"); GOT=${GOT:-0}
      (( GOT == NEED )) && break
      log "块 $OFF-$END 第 $TRY 次只拿到 $GOT/$NEED，稍候重试"
      sleep 5
    done

    if (( GOT == NEED )); then
      cat "$CHUNK_FILE" >> "$PART"
      OFF=$(( OFF + NEED ))
      rm -f "$CHUNK_FILE"
    else
      log "块 $OFF-$END 重试仍失败（$GOT/$NEED），本轮中止，保留 .part"
      FAILED=1
      break
    fi
  done

  FINAL=$(fsize "$PART"); FINAL=${FINAL:-0}
  if (( FAILED == 0 && FINAL == TOTAL )); then
    if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$PART" 2>/dev/null; then
      mv "$PART" "$CATALOG"
      # 属主必须改成 jingyu：本脚本以 root 运行（curl 写文件），
      # 但下游导入是 sudo -u jingyu 读这份 JSON。
      # 不改属主会直接 EACCES —— 实测踩过：整轮 sync 看着"完成"，
      # 实际导入那步静默失败、公开条目一条没加。
      chown jingyu:jingyu "$CATALOG"
      chmod 644 "$CATALOG"
      log "catalog 更新成功（$FINAL 字节）"
    else
      log 'JSON 校验失败，丢弃本轮结果，保留旧副本'
      rm -f "$PART"
    fi
  else
    log "本轮未拉完（$FINAL/$TOTAL），保留 .part 下轮续"
  fi
fi
fi   # ← 闭合 RELAY_OK 判断

# ---------- ② 导入（始终读本地副本） ----------
if [[ -f "$CATALOG" ]]; then
  cd /var/www/jingyu/server
  sudo -u jingyu DB_PATH="$DB" node scripts/import-awesome.mjs \
    --url "file://$CATALOG" >> "$LOG" 2>&1 || log '导入失败（旧副本仍可用）'
else
  log '本地副本不存在，跳过导入'
fi

# ---------- ③ 自动审核（新导入的条目一律是 pending） ----------
# 为什么审核要和导入串在同一个 service 里而不是各挂一个 timer：
#   两者有依赖（审核必须发生在导入之后），拆成两个 timer 无法保证顺序，
#   而且会出现「导入完还没审，公开面一直是旧的」的窗口期。
#   串在一起后，一次 sync = 拉取 → 导入 → 审核 → 上架，跑完即生效。
#
# 审核器是**确定性规则**，不是调模型：
#   · 可复现（同一批数据结论一致）、可审计（每条带命中规则）、零成本、服务器无模型凭据。
#   · 阈值经 21 条真实高危样本校准：拦截 100%、误杀 0（见 --test）。
if [[ -f /var/www/jingyu/server/scripts/review-plugins.cjs ]]; then
  cd /var/www/jingyu/server
  sudo -u jingyu DB_PATH="$DB" node scripts/review-plugins.cjs >> "$LOG" 2>&1 \
    || log '审核失败（新条目留在 pending，不影响已上架内容）'
else
  log '审核脚本不存在，跳过（新条目留在 pending）'
fi

log 'sync done'
PEND=$(sudo -u jingyu node -e "
  const D=require('/var/www/jingyu/server/node_modules/better-sqlite3');
  const d=new D('$DB',{readonly:true});
  process.stdout.write(String(d.prepare(\"SELECT COUNT(*) n FROM plugins WHERE status='pending'\").get().n));
" 2>/dev/null || echo '?')
log "仍有 $PEND 条待人工复核"
/usr/bin/logger -t jingyu-sync-awesome "awesome 目录同步完成（待人工 $PEND 条）"
