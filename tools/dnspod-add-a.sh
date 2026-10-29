#!/usr/bin/env bash
#
# 给 seekbbs.cn 添加 A 记录（DNSPod API）
#
# 为什么需要你亲手跑一次：本机与两台服务器上都没有 DNSPod / 腾讯云 API 凭据，
# 而「加一条 DNS 记录」必须先有账号级授权。这个脚本只做一件事，读两个环境变量，
# 不落盘、不写日志、不改任何本机配置。
#
# 获取 Token（二选一）：
#   ① 新版 DNSPod Token（推荐，权限最小）：
#      https://console.dnspod.cn/account/token   → 创建 Token → 记下 ID 与 Token
#   ② 腾讯云 API 密钥（如果 DNSPod 账号已并入腾讯云）：
#      https://console.cloud.tencent.com/cam/capi
#
# 用法：
#   DNSPOD_ID=<你的ID> DNSPOD_TOKEN=<你的Token> bash tools/dnspod-add-a.sh
#
#   加 www 子域：
#   DNSPOD_ID=... DNSPOD_TOKEN=... DOMAIN=www.seekbbs.cn bash tools/dnspod-add-a.sh
#
#   只检查不加：
#   DNSPOD_ID=... DNSPOD_TOKEN=... DRY_RUN=1 bash tools/dnspod-add-a.sh

set -euo pipefail

DOMAIN="${DOMAIN:-seekbbs.cn}"
IP="${IP:-43.142.153.74}"

if [[ -z "${DNSPOD_ID:-}" || -z "${DNSPOD_TOKEN:-}" ]]; then
  echo "缺少 DNSPOD_ID / DNSPOD_TOKEN。" >&2
  echo "去 https://console.dnspod.cn/account/token 创建一个，然后：" >&2
  echo "  DNSPOD_ID=xxx DNSPOD_TOKEN=yyy bash $0" >&2
  exit 1
fi

api() {
  curl -sS -X POST "https://dnsapi.cn/$1" \
    -d "login_token=${DNSPOD_ID},${DNSPOD_TOKEN}" \
    -d 'format=json' \
    -d 'lang=cn' \
    "${@:2}"
}

echo "== 1) 校验 Token 与域名归属 =="
api Domain.List | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const j=JSON.parse(s);
    if(!j.status||j.status.code!=="1"){console.error("API 报错:",JSON.stringify(j.status));process.exit(1);}
    const names=(j.domains||[]).map(d=>d.name);
    console.log("可见域名:", names.join(", ") || "(空)");
    const want=process.argv[1];
    if(!names.includes(want)){console.error("这个 Token 下看不到 "+want);process.exit(2);}
    console.log("✓ 能看到 "+want);
  })
' "$DOMAIN"

echo "== 2) 列出已有记录 =="
api Record.List -d "domain=${DOMAIN}" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const j=JSON.parse(s);
    if(!j.status||j.status.code!=="1"){console.error(JSON.stringify(j.status));process.exit(1);}
    const rs=j.records||[];
    if(!rs.length){console.log("(当前没有任何记录)");return;}
    for(const r of rs) console.log("  "+r.type.padEnd(6)+" "+r.name.padEnd(20)+" "+r.value+"  (id="+r.id+")");
  })
'

if [[ "${DRY_RUN:-0}" != "0" ]]; then
  echo "== DRY_RUN=1，只看不改 =="
  exit 0
fi

echo "== 3) 添加 A 记录 ${DOMAIN} -> ${IP} =="
SHORT="${DOMAIN%.seekbbs.cn}"
[[ "$SHORT" == "$DOMAIN" ]] && SHORT="@"
[[ "$SHORT" == "www" ]] && SHORT="www"

api Record.Create \
  -d "domain=${DOMAIN}" \
  -d "sub_domain=${SHORT}" \
  -d 'record_type=A' \
  -d "value=${IP}" \
  -d 'record_line=默认' \
  -d 'ttl=600' | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const j=JSON.parse(s);
    if(!j.status||j.status.code!=="1"){console.error("创建失败:",JSON.stringify(j.status));process.exit(1);}
    console.log("✓ 已创建:", JSON.stringify(j.record));
  })
'

echo
echo "== 4) 等待生效并验证（DNSPod 的 TTL=600，一般 1-2 分钟）=="
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sI -m 10 "http://${DOMAIN}/" >/dev/null 2>&1; then
    echo "✓ http://${DOMAIN}/ 已可访问"
    curl -sI -m 10 "http://${DOMAIN}/" | head -3
    exit 0
  fi
  echo "  第 ${i} 次还没通，15 秒后重试…"
  sleep 15
done
echo "! 还没通。手动确认：" >&2
echo "    node -e \"require('node:dns').resolve4('${DOMAIN}',(e,a)=>console.log(e||a))\"" >&2
exit 3
