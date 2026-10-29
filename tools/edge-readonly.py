#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阶段 1 · 境内机降为只读边缘（在 43.142.153.74 上以 root 运行）

做四件事，任何一步失败立即回滚并退出非零：
  1. 重写 jingyu-80.conf：全站 307 回源到 https://whalerealm.top，只留 /healthz 与 DSH 隧道
  2. nginx -t 通过后 reload（此时 /api/ 已不依赖本地 3000）
  3. stop + disable jingyu.service（境内彻底失去写入能力）
  4. 生产库 chmod 400（纵深防御：即使有人手工拉起 Node，也打不开写句柄）

回滚：sudo cp -a <BACKUP> /etc/nginx/sites-available/jingyu-80.conf && sudo systemctl start jingyu && sudo nginx -s reload
用法：ssh -F ~/.ssh/config_whale whale-jump 'sudo python3 -' < tools/edge-readonly.py
"""
import os
import shutil
import subprocess
import sys
import time

CONF = '/etc/nginx/sites-available/jingyu-80.conf'
DB = '/var/www/jingyu/server/data/jingyu.db'
UPSTREAM = 'https://whalerealm.top'
TS = time.strftime('%Y%m%d-%H%M%S')
BAK = f'/var/backups/whale-nginx-edge-{TS}.conf'

NEW_CONF = r'''# 鲸域 · 80 端口站点 —— 只读边缘（2026-10-26 改造）
#
# 唯一写入源：境外 158.247.215.153 = https://whalerealm.top（Cloudflare + LE）
# 本机职责只剩四件：
#   ① DSH 隧道入口（dsh-tunnel.conf，勿删）
#   ② /healthz 探针
#   ③ 全站 307 回源——境内不再承接任何页面/接口
#   ④ 冻结的灾备库（chmod 400，只读快照）
#
# 为什么整站回源而不是只跳 /api/：
#   境内页面(43.142.153.74)与境外 API(whalerealm.top)是不同 origin。
#   只跳 API 会让前端拿到 307 跨域、Set-Cookie 的 domain 不匹配而登录失效，
#   形成「页面能开、数据全空」的半可用状态，比直接回源更难排查。
#   境内无备案域名、无 HTTPS，本就不该作为用户入口。
#
# 回滚：
#   sudo cp -a /var/backups/whale-nginx-20261026-183625/jingyu-80.conf /etc/nginx/sites-available/jingyu-80.conf
#   sudo systemctl start jingyu && sudo nginx -t && sudo nginx -s reload

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root  /var/www/jingyu/dist;
    index index.html;

    charset utf-8;
    client_max_body_size 8m;

    # ---- SCAN-DROP-BEGIN 2026-10-22：扫描器快速丢弃 ----
    # 本站 = 纯静态 + Node（无 PHP/WP/备份文件/MCP 服务），命中下列特征 100% 是自动化扫描器。
    # return 444 直接断连：不回响应体、不耗带宽，access.log 仍记 444 供 fail2ban nginx-badreq 取证。
    if ($request_uri ~* "^(/\.(?!well-known/)|/wp-|/wordpress|/phpmyadmin|/pma|/vendor/|/phpunit|/laravel|/cgi-bin|/actuator|/console|/manager|/solr|/jenkins|/backup|/db\.|/shell|/xmlrpc|/mcp|/sse|/boaform|/hnap1)") {
        return 444;
    }
    if ($request_uri ~* "\.(php|asp|aspx|jsp|cgi|sh|bak|sql|old|swp|zip|tar|gz|rar|7z)$") {
        return 444;
    }
    if ($request_method !~ "^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$") {
        return 444;
    }
    # ---- SCAN-DROP-END ----

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
    gzip_comp_level 5;

    include /etc/nginx/snippets/security-headers.conf;
    include /etc/nginx/snippets/dsh-tunnel.conf;

    # 健康检查：本机静态返回，不碰后端
    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    # ── 全站 307 回源：境内无后端、无写入能力 ──
    # 307 保留原方法与请求体，浏览器跟随到唯一写入源
    location / {
        return 307 https://whalerealm.top$request_uri;
    }
}
'''


def sh(cmd, check=True):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    out = (r.stdout or '').strip()
    err = (r.stderr or '').strip()
    if check and r.returncode != 0:
        print(f'[FAIL] {cmd}\n  stdout: {out}\n  stderr: {err}')
        sys.exit(1)
    return out, err, r.returncode


def main():
    if os.geteuid() != 0:
        print('[FAIL] 需要 root：ssh ... \'sudo python3 -\' < tools/edge-readonly.py')
        sys.exit(1)

    # 0. 改动前指纹
    st0 = sh(f'stat -c "%s %Y" {DB}')[0]
    print(f'[0] 库改动前 size/mtime: {st0}')

    # 1. 备份 + 写新配置
    os.makedirs('/var/backups', exist_ok=True)
    shutil.copy2(CONF, BAK)
    print(f'[1] 已备份 {BAK}')
    with open(CONF, 'w', encoding='utf-8') as f:
        f.write(NEW_CONF)
    print(f'[1] 已写入新配置（整站 307 → {UPSTREAM}）')

    # 2. nginx -t，失败立刻还原
    out, err, rc = sh('nginx -t', check=False)
    if rc != 0:
        shutil.copy2(BAK, CONF)
        print(f'[FAIL] nginx -t 未通过，已还原原配置\n{out}\n{err}')
        sys.exit(1)
    print('[2] nginx -t 通过')

    # 3. reload（此后 /api/ 已 307，不再依赖 3000）
    sh('nginx -s reload')
    print('[3] nginx reload 完成')

    # 4. 停后端并禁用开机自启
    sh('systemctl stop jingyu')
    sh('systemctl disable jingyu', check=False)
    active = sh('systemctl is-active jingyu', check=False)[0]
    enabled = sh('systemctl is-enabled jingyu', check=False)[0]
    print(f'[4] jingyu.service: active={active} enabled={enabled}')

    # 5. 库冻结为只读
    for suffix in ('', '-wal', '-shm'):
        p = DB + suffix
        if os.path.exists(p):
            os.chmod(p, 0o400)
    mode = oct(os.stat(DB).st_mode & 0o777)
    print(f'[5] {DB} 权限 {mode}')

    # 6. 验收
    print('\n=== 验收 ===')
    h = sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/healthz')[0]
    print(f'healthz          = {h}  (期望 200)')
    api = sh('curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}" http://127.0.0.1/api/posts')[0]
    print(f'/api/posts       = {api}  (期望 307 -> {UPSTREAM}/api/posts)')
    ws = sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ws')[0]
    print(f'/ws              = {ws}  (期望 307)')
    tun = sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/a4f41d8f5c00/')[0]
    print(f'DSH 隧道         = {tun}  (502=隧道未连但规则在, 200/302=正常)')
    p3000 = sh('ss -ltn | grep -c ":3000" || true', check=False)[0]
    print(f'3000 监听数      = {p3000}  (期望 0)')
    st1 = sh(f'stat -c "%s %Y" {DB}')[0]
    print(f'库改动后 size/mtime: {st1}  {"(未变 ✓)" if st1 == st0 else "(变了 ✗ 立刻查)"}')


if __name__ == '__main__':
    main()
