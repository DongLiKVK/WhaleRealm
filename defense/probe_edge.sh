#!/bin/bash
R="--resolve seekbbs.cn:443:127.0.0.1 --resolve seekbbs.cn:80:127.0.0.1"
B=https://seekbbs.cn
probe() {
  local n="$1"; local u="$2"; shift 2
  local out code size ct first=""
  out=$(curl -sS --max-time 10 $R -o /tmp/b.$$ -w "%{http_code}|%{size_download}|%{content_type}|%{redirect_url}" "$@" "$u" 2>&1)
  code=$(printf '%s' "$out" | cut -d'|' -f1); size=$(printf '%s' "$out" | cut -d'|' -f2)
  ct=$(printf '%s' "$out" | cut -d'|' -f3); loc=$(printf '%s' "$out" | cut -d'|' -f4)
  [ -s /tmp/b.$$ ] && first=$(head -c 90 /tmp/b.$$ | tr -d '\r\n')
  printf "%-30s | %-4s | %-7s | %-24s | %-22s | %s\n" "$n" "$code" "$size" "$ct" "$loc" "$first"
  rm -f /tmp/b.$$
}
echo "### A6 sensitive files / info"
probe "/.git/config"      "$B/.git/config"
probe "/.env"             "$B/.env"
probe "/.DS_Store"        "$B/.DS_Store"
probe "/server/.env"      "$B/server/.env"
probe "/backup.zip"       "$B/backup.zip"
probe "/healthz"          "$B/healthz"
probe "/api/healthz"      "$B/api/healthz"
probe "/uploads/"         "$B/uploads/"
probe "/admin/"           "$B/admin/"
probe "/robots.txt"       "$B/robots.txt"
probe "/acme (wellknown)" "$B/.well-known/acme-challenge/test"
echo
echo "### A5 methods on /"
for m in TRACE DEBUG CONNECT PUT DELETE PATCH OPTIONS HEAD; do probe "METHOD $m" "$B/" -X "$m"; done
echo
echo "### A5 traversal / dot-bypass (--path-as-is)"
probe "/../etc/passwd"        "$B/../etc/passwd" --path-as-is
probe "/assets/../../etc/pw"  "$B/assets/../../etc/passwd" --path-as-is
probe "/%2e%2e%2f%2e%2e/etc"  "$B/%2e%2e%2f%2e%2e%2fetc%2fpasswd"
probe "//.env (double slash)"  "$B//.env"
probe "/./.env"               "$B/./.env"
probe "/api/../.env"          "$B/api/../.env" --path-as-is
probe "/%2eenv (encoded dot)"  "$B/%2eenv"
echo
echo "### A5 case bypass of SCAN-DROP"
probe "/.ENV"        "$B/.ENV"
probe "/.Git/config" "$B/.Git/config"
probe "/WP-ADMIN"    "$B/WP-ADMIN"
probe "/x.PHP"       "$B/x.PHP"
probe "/.env%20"     "$B/.env%20"
probe "/.env%09"     "$B/.env%09"
echo
echo "### A4 bad_ua / bad_uri probes (loopback)"
probe "UA sqlmap"        "$B/api/feed" -A "sqlmap/1.7"
probe "UA nuclei"        "$B/api/feed" -A "nuclei/v3"
probe "UA curl(default)" "$B/api/feed" -A "curl/8.22.0"
probe "uri union/*/sel"  "$B/api/feed?cursor=1%20union/**/select%201"
probe "uri 'or'1'='1"    "$B/api/feed?cursor=1%27or%271%27%3D%271"
probe "uri %3Cimg"       "$B/api/feed?cursor=%3Cimg%20src=x%20onerror=alert(1)%3E"
probe "uri bare quote"   "$B/api/feed?cursor=%27"
probe "uri sleep(5)"     "$B/api/feed?cursor=1%20and%20sleep(5)"
