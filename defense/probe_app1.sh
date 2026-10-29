#!/bin/bash
R="--resolve seekbbs.cn:443:127.0.0.1"
B=https://seekbbs.cn
probe() {
  local n="$1"; local u="$2"; shift 2
  local out code size ct first=""
  out=$(curl -sS --http1.1 --max-time 10 $R -o /tmp/b.$$ -w "%{http_code}|%{size_download}|%{content_type}" "$@" "$u" 2>&1)
  code=$(printf '%s' "$out" | cut -d'|' -f1); size=$(printf '%s' "$out" | cut -d'|' -f2); ct=$(printf '%s' "$out" | cut -d'|' -f3)
  [ -s /tmp/b.$$ ] && first=$(head -c 100 /tmp/b.$$ | tr -d '\r\n')
  printf "%-32s | %-4s | %-6s | %-26s | %s\n" "$n" "$code" "$size" "$ct" "$first"
  rm -f /tmp/b.$$
}
echo "### exact codes for drop-list (HTTP/1.1)"
probe "/.env"            "$B/.env"
probe "/.git/config"     "$B/.git/config"
probe "/.DS_Store"       "$B/.DS_Store"
probe "/WP-ADMIN"        "$B/WP-ADMIN"
probe "/.ENV"            "$B/.ENV"
probe "/./.env"          "$B/./.env"
probe "/api/../.env"     "$B/api/../.env" --path-as-is
probe "/DEBUG method"    "$B/" -X DEBUG
probe "UA sqlmap"        "$B/api/feed" -A "sqlmap/1.7"
probe "UA nuclei"        "$B/api/feed" -A "nuclei"
probe "uri %3Cimg xss"   "$B/api/feed?cursor=%3Cimg%20src=x%20onerror=alert(1)%3E"
probe "uri sleep(5)"     "$B/api/feed?cursor=1%20and%20sleep(5)"
probe "uri union/**/sel"  "$B/api/feed?cursor=1%20union/**/select%201"
echo
echo "### app-layer injection probes (feed/posts/forums)"
probe "feed plain"            "$B/api/feed"
probe "feed limit=-1"         "$B/api/feed?limit=-1"
probe "feed limit=99999999999" "$B/api/feed?limit=99999999999"
probe "feed limit=abc"        "$B/api/feed?limit=abc"
probe "feed cursor=abc"       "$B/api/feed?cursor=abc"
probe "feed cursor=1%27or%271%27%3D%271" "$B/api/feed?cursor=1%27or%271%27%3D%271"
probe "feed cursor=%27--"     "$B/api/feed?cursor=%27%20--%20"
probe "post id=1"             "$B/api/posts/1"
probe "post id=abc"           "$B/api/posts/abc"
probe "post id=1 union sel"   "$B/api/posts/1%20union%2f**%2fselect%201"
probe "post id=-1"            "$B/api/posts/-1"
probe "forums/%27/threads"    "$B/api/forums/%27/threads"
probe "forums/abc/threads"    "$B/api/forums/abc/threads"
probe "api/nope (404 shape)"  "$B/api/nope"
probe "static/../../ (400?)"  "$B/static/%2e%2e%2f%2e%2e%2fetc%2fpasswd"
echo
echo "### info leak bodies"
echo "--- /api/healthz ---"; curl -sS --http1.1 $R "$B/api/healthz"
echo; echo "--- /robots.txt ---"; curl -sS --http1.1 $R "$B/robots.txt"
echo; echo "--- 404 body ---"; curl -sS --http1.1 $R "$B/definitely-not-here-12345" -o /tmp/p404 -w "%{http_code}\n"; head -c 400 /tmp/p404
echo; echo "--- 404 headers ---"; curl -sS --http1.1 $R -D - -o /dev/null "$B/definitely-not-here-12345" | head -20
