#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""jingyu-ipguard-sg —— 腾讯云轻量应用服务器防火墙：22/443 放行源自动跟随出口 IP
纯标准库实现 TC3-HMAC-SHA256 签名，无需安装 SDK。

凭据文件（JSON，权限 600）：
  /etc/jingyu-ipguard/tc.json
  {"secret_id": "AKIDxxxx", "secret_key": "xxxx",
   "region": "ap-guangzhou", "instance_id": "lhins-53h97tl8", "ports": ["22", "443"]}

用法：
  jingyu-ipguard-sg show              列出当前防火墙规则
  jingyu-ipguard-sg check <ip>        检查 22/443 是否已对该 IP 放行
  jingyu-ipguard-sg apply <ip>        把 22/443 的放行源改为该 IP（先建新规则再删旧的）
"""
import datetime
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

CRED_PATH = os.environ.get("JINGYU_TC_CRED", "/etc/jingyu-ipguard/tc.json")
HOST = "lighthouse.tencentcloudapi.com"
SERVICE = "lighthouse"
API_VERSION = "2020-03-24"


def die(msg):
    sys.stderr.write(msg + "\n")
    sys.exit(1)


def load_cred():
    if not os.path.exists(CRED_PATH):
        die("未配置腾讯云密钥：缺少 %s\n"
            "  格式：{\"secret_id\":\"AKID...\",\"secret_key\":\"...\",\"region\":\"ap-guangzhou\",\"instance_id\":\"lhins-53h97tl8\"}" % CRED_PATH)
    with open(CRED_PATH, encoding="utf-8") as fh:
        cred = json.load(fh)
    for key in ("secret_id", "secret_key", "instance_id"):
        if not cred.get(key):
            die("%s 缺少字段 %s" % (CRED_PATH, key))
    cred.setdefault("region", "ap-guangzhou")
    cred.setdefault("ports", ["22", "443"])
    return cred


def _hmac(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def call(action, payload, cred):
    ts = int(time.time())
    date = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    ctype = "application/json; charset=utf-8"
    headers = "content-type:%s\nhost:%s\nx-tc-action:%s\n" % (ctype, HOST, action.lower())
    signed = "content-type;host;x-tc-action"
    hashed_body = hashlib.sha256(body.encode("utf-8")).hexdigest()
    creq = "POST\n/\n\n%s\n%s\n%s" % (headers, signed, hashed_body)
    scope = date + "/" + SERVICE + "/tc3_request"
    sts = "TC3-HMAC-SHA256\n%d\n%s\n%s" % (ts, scope, hashlib.sha256(creq.encode("utf-8")).hexdigest())
    k_date = _hmac(("TC3" + cred["secret_key"]).encode("utf-8"), date)
    k_service = _hmac(k_date, SERVICE)
    k_signing = _hmac(k_service, "tc3_request")
    signature = hmac.new(k_signing, sts.encode("utf-8"), hashlib.sha256).hexdigest()
    auth = "TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s" % (
        cred["secret_id"], scope, signed, signature)
    req = urllib.request.Request(
        "https://" + HOST, data=body.encode("utf-8"), method="POST",
        headers={
            "Authorization": auth,
            "Content-Type": ctype,
            "Host": HOST,
            "X-TC-Action": action,
            "X-TC-Version": API_VERSION,
            "X-TC-Timestamp": str(ts),
            "X-TC-Region": cred["region"],
        })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        die("HTTP %s：%s" % (exc.code, exc.read().decode("utf-8", "replace")[:400]))
    except Exception as exc:
        die("请求失败：%s" % exc)
    resp_obj = data.get("Response", {})
    if "Error" in resp_obj:
        err = resp_obj["Error"]
        raise RuntimeError("%s: %s (%s)" % (err.get("Code"), err.get("Message"), action))
    return resp_obj


def describe(cred):
    resp = call("DescribeFirewallRules", {"InstanceId": cred["instance_id"], "Limit": 100}, cred)
    return resp.get("FirewallRuleSet", []), resp.get("FirewallVersion")


def rule_brief(rule):
    return "%s/%s -> %s  %s" % (
        rule.get("Protocol"), rule.get("Port") or "-", rule.get("CidrBlock"),
        rule.get("Action")), rule.get("FirewallRuleDescription", "")


def cmd_show(cred):
    rules, version = describe(cred)
    print("== 腾讯云轻量防火墙（实例 %s，版本 %s）==" % (cred["instance_id"], version))
    for rule in rules:
        brief, desc = rule_brief(rule)
        print("  %-50s %s  [RuleId %s]" % (brief, desc, str(rule.get("RuleId"))[:8]))
    return 0


def is_target(rule, ports):
    return str(rule.get("Protocol", "")).upper() == "TCP" and str(rule.get("Port", "")) in ports


def cmd_check(cred, ip):
    rules, _ = describe(cred)
    want = ip + "/32"
    hits = [r for r in rules if is_target(r, cred["ports"]) and r.get("CidrBlock") == want]
    print("端口 %s 对 %s 的放行规则：%d 条" % (",".join(cred["ports"]), want, len(hits)))
    return 0 if hits else 1


def cmd_apply(cred, ip):
    want = ip + "/32"
    rules, _ = describe(cred)
    stale = [r for r in rules if is_target(r, cred["ports"]) and r.get("CidrBlock") != want]
    fresh = [r for r in rules if is_target(r, cred["ports"]) and r.get("CidrBlock") == want]
    if not stale and fresh:
        print("防火墙已放行 %s，无需改动" % want)
        return 0
    print("目标：%s 的 22/443 放行源 → %s" % (",".join(cred["ports"]), want))

    # 1) 先新增规则（保证不中断现有通道）
    to_create = []
    for port in cred["ports"]:
        if not any(str(r.get("Port")) == port for r in fresh):
            to_create.append({"Protocol": "TCP", "Port": port, "CidrBlock": want,
                              "Action": "ACCEPT", "FirewallRuleDescription": "ipguard-auto"})
    if to_create:
        call("CreateFirewallRules", {"InstanceId": cred["instance_id"], "FirewallRules": to_create}, cred)
        print("  已新增 %d 条放行规则（%s）" % (len(to_create), want))

    # 2) 再删除旧 IP 的规则
    if stale:
        call("DeleteFirewallRules", {"InstanceId": cred["instance_id"],
                                     "FirewallRules": [{"RuleId": r["RuleId"]} for r in stale]}, cred)
        print("  已删除 %d 条旧放行规则" % len(stale))
    return 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    cred = load_cred()
    try:
        if cmd == "show":
            return cmd_show(cred)
        if cmd == "check":
            if len(argv) < 3:
                die("用法：jingyu-ipguard-sg check <ip>")
            return cmd_check(cred, argv[2])
        if cmd == "apply":
            if len(argv) < 3:
                die("用法：jingyu-ipguard-sg apply <ip>")
            return cmd_apply(cred, argv[2])
        print(__doc__)
        return 2
    except RuntimeError as exc:
        die(str(exc))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
