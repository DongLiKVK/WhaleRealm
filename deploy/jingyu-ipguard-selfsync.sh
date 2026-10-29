#!/usr/bin/env bash
# ============================================================================
# jingyu-ipguard-selfsync —— 非特权入口（给 Windows 计划任务用的薄壳）
#   为什么需要它：sudo 默认清空环境变量（env_reset），root 下的 jingyu-ipguard
#   看不到 $SSH_CLIENT。所以必须先在普通用户会话里读出「服务器亲眼看到的来源 IP」，
#   再把这个 IP 作为参数交给 root 的 jingyu-ipguard。
# 用法：jingyu-ipguard-selfsync [--quiet]
# ============================================================================
set -uo pipefail
BIN=/usr/local/sbin/jingyu-ipguard

ip=$(printenv SSH_CLIENT 2>/dev/null | awk '{print $1}')
if [ -z "$ip" ]; then
  printf 'IPGUARD_STATUS=error reason=no_ssh_client\n' >&2
  echo "无法确定来源 IP：本脚本必须通过 SSH 会话调用" >&2
  exit 3
fi

exec sudo -n "$BIN" set-auto "$ip" "$@"
