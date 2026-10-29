#!/usr/bin/env bash
# ============================================================================
# 鲸域防护层安装器（2026-10-29）—— 幂等、可回滚
# 用法：sudo bash /tmp/jingyu-defense-stage/install-shield.sh
# 原则：先全量备份 → 安装 → nginx -t → 失败整体回滚 → 成功才 reload
# ============================================================================
set -euo pipefail

STAGE="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date '+%Y%m%d-%H%M%S')"
BK="/var/backups/jingyu-defense/pre-$TS"
NGX=/etc/nginx
F2B=/etc/fail2ban

[ "$(id -u)" -eq 0 ] || { echo "需要 root"; exit 1; }

echo "== 备份到 $BK"
mkdir -p "$BK" && chmod 700 "$BK"
for f in "$NGX/conf.d/10-shield.conf" "$NGX/blocked_ips.conf" \
         "$NGX/snippets/shield-mode.conf" "$NGX/snippets/shield-strict-loc.conf" \
         "$NGX/sites-available/jingyu-443.conf" "$NGX/sites-available/jingyu-80.conf" \
         "$F2B/jail.d/99-jingyu-hardening.conf" "$F2B/filter.d/jingyu-shield.conf" \
         "$F2B/filter.d/jingyu-ratelimit.conf" "$F2B/filter.d/jingyu-login.conf" \
         /usr/local/sbin/jingyu-defense /usr/local/sbin/jingyu-attack-watch \
         /var/www/jingyu/dist/robots.txt; do
    if [ -e "$f" ]; then
        cp -a "$f" "$BK/$(basename "$f")"
        echo "   backup $(basename "$f")"
    fi
done

echo "== 安装 nginx 层"
install -m 644 -o root -g root "$STAGE/nginx/10-shield.conf" "$NGX/conf.d/10-shield.conf"
if [ -f "$NGX/blocked_ips.conf" ]; then
    echo "   blocked_ips.conf 已存在，保留不动"
else
    install -m 644 -o root -g root "$STAGE/nginx/blocked_ips.conf" "$NGX/blocked_ips.conf"
fi
# 档位文件只在首次安装时落 NORMAL，已存在则不覆盖（避免把 ATTACK 档打回 NORMAL）
if [ -f "$NGX/snippets/shield-mode.conf" ]; then
    echo "   shield-mode.conf 已存在，保留当前档位"
else
    install -m 644 "$STAGE/nginx/shield-mode.normal.conf" "$NGX/snippets/shield-mode.conf"
fi
if [ -f "$NGX/snippets/shield-strict-loc.conf" ]; then
    echo "   shield-strict-loc.conf 已存在，保留"
else
    install -m 644 "$STAGE/nginx/shield-strict-loc.normal.conf" "$NGX/snippets/shield-strict-loc.conf"
fi
install -m 644 "$STAGE/nginx/jingyu-443.conf" "$NGX/sites-available/jingyu-443.conf"
install -m 644 "$STAGE/nginx/jingyu-80.conf"  "$NGX/sites-available/jingyu-80.conf"

if [ -f /var/www/jingyu/dist/robots.txt ]; then
    echo "   robots.txt 已存在，保留"
else
    install -m 644 -o www-data -g www-data "$STAGE/nginx/robots.txt" /var/www/jingyu/dist/robots.txt
fi

echo "== nginx -t"
if ! nginx -t 2>&1 | tee /tmp/jingyu-install-nginxt.log; then
    echo "!! nginx -t 失败，回滚 nginx 配置"
    for f in 10-shield.conf blocked_ips.conf shield-mode.conf shield-strict-loc.conf; do
        [ -f "$BK/$f" ] || continue
        case "$f" in
            10-shield.conf|blocked_ips.conf) install -m 644 "$BK/$f" "$NGX/conf.d/$f" 2>/dev/null || install -m 644 "$BK/$f" "$NGX/$f" ;;
            *) install -m 644 "$BK/$f" "$NGX/snippets/$f" ;;
        esac
    done
    for f in jingyu-443.conf jingyu-80.conf; do
        [ -f "$BK/$f" ] && install -m 644 "$BK/$f" "$NGX/sites-available/$f"
    done
    exit 1
fi

echo "== 安装 fail2ban 过滤器与 jail"
install -m 644 "$STAGE/fail2ban/filter.d/jingyu-shield.conf"    "$F2B/filter.d/jingyu-shield.conf"
install -m 644 "$STAGE/fail2ban/filter.d/jingyu-ratelimit.conf" "$F2B/filter.d/jingyu-ratelimit.conf"
install -m 644 "$STAGE/fail2ban/filter.d/jingyu-login.conf"     "$F2B/filter.d/jingyu-login.conf"
install -m 644 "$STAGE/fail2ban/jail.d/99-jingyu-hardening.conf" "$F2B/jail.d/99-jingyu-hardening.conf"

echo "== 安装运维脚本"
install -m 755 -o root -g root "$STAGE/sbin/jingyu-defense.sh"      /usr/local/sbin/jingyu-defense
install -m 755 -o root -g root "$STAGE/sbin/jingyu-attack-watch.sh" /usr/local/sbin/jingyu-attack-watch
[ -f /etc/jingyu-defense.mode ] || printf 'normal\n' > /etc/jingyu-defense.mode
chmod 644 /etc/jingyu-defense.mode
touch /var/log/jingyu-defense.log && chmod 640 /var/log/jingyu-defense.log

echo "== reload nginx"
systemctl reload nginx
sleep 1
systemctl is-active nginx

echo "== 检查 fail2ban 语法并重载"
if fail2ban-client -t >/tmp/jingyu-f2b-test.log 2>&1; then
    systemctl reload fail2ban || systemctl restart fail2ban
    sleep 2
    fail2ban-client status jingyu-shield 2>/dev/null | head -5 || true
else
    echo "!! fail2ban 配置有问题："
    sed -n '1,40p' /tmp/jingyu-f2b-test.log
    echo "   nginx 层已生效；fail2ban 新增 jail 未启用（jail.d/99 被移除）"
    rm -f "$F2B/jail.d/99-jingyu-hardening.conf"
    systemctl reload fail2ban 2>/dev/null || true
fi

echo "== 完成，备份目录 $BK"
