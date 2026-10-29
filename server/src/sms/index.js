/**
 * 短信通道适配层（v48）
 *
 * 为什么单独一层：验证码的下发只有一个「谁去发」的问题，但国内可选的通道五花八门 ——
 * 腾讯云 / 阿里云 / 各家聚合商（云片、容联、SUBMAIL…）/ 自建网关。把这些差异关在这一个文件里，
 * 路由层只写 await sms.send({ phone, code, ttl })，换供应商时不用动 phone.js。
 *
 * 约定：
 *  1) 只依赖内置 crypto + fetch（Node 20+），不引任何云 SDK —— 官方 SDK 动辄几十个传递依赖，
 *     为了发一条验证码把整棵依赖树搬进后端不划算，而且出问题时排查面更大。
 *  2) 失败一律 throw SmsError（带 .code / .provider / .detail），不返回 { ok:false }：
 *     调用方用 try/catch 处理「没发出去」这一件事，不给它留「忘了看返回值」的缝。
 *  3) 日志里不留完整号码、不留验证码。号码一律打码后再进日志（masked 由调用方负责）。
 *  4) 超时 8 秒、网络错误重试 1 次；业务错误（模板不存在 / 余额不足 / 号码黑名单）不重试，
 *     重试只会把同一条错误码收两遍。
 *
 * 支持 provider（env SMS_PROVIDER）：
 *    dev      —— 不发真短信，码写进进程日志；只在本地/CI 用（等价老开关 SMS_DEV=1）
 *    tencent  —— 腾讯云短信 SendSms 2021-01-11，TC3-HMAC-SHA256 签名
 *    aliyun   —— 阿里云短信 dysmsapi SendSms 2017-05-25，RPC 签名 HMAC-SHA1
 *    webhook  —— 通用 HTTP 网关：POST JSON 到 SMS_WEBHOOK_URL
 *                （云片 / 容联 / SUBMAIL / 自建短信网关都能用这一路，服务端只认 2xx）
 *    none     —— 没接通道（默认）。此时 phone.js 会如实回 delivered=false
 */
'use strict';

const crypto = require('crypto');

const TIMEOUT_MS = 8000;
const RETRY = 1;

class SmsError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = 'SmsError';
    this.code = code;
    this.detail = detail || '';
  }
}

function env(key) {
  return String(process.env[key] || '').trim();
}

/* 每个 provider 需要哪些 env 才算「配好了」。少一项就别假装能发 ——
   前端拿 smsEnabled 决定要不要把用户拦在认证页，配错一半比全不配更坑。 */
const REQUIRED = {
  dev: [],
  tencent: ['SMS_SECRET_ID', 'SMS_SECRET_KEY', 'SMS_SDK_APP_ID', 'SMS_SIGN_NAME', 'SMS_TEMPLATE_ID'],
  aliyun: ['SMS_ACCESS_KEY_ID', 'SMS_ACCESS_KEY_SECRET', 'SMS_SIGN_NAME', 'SMS_TEMPLATE_CODE'],
  webhook: ['SMS_WEBHOOK_URL'],
  none: []
};

function provider() {
  const p = env('SMS_PROVIDER').toLowerCase();
  if (p && REQUIRED[p]) return p;
  /* 兼容老开关：只写 SMS_DEV=1 时行为与 provider=dev 一致 */
  if (env('SMS_DEV') === '1') return 'dev';
  return 'none';
}

function missingKeys(p) {
  return (REQUIRED[p || provider()] || []).filter(function (k) { return !env(k); });
}

/** 能否真的把码送到用户手上（dev 也算，因为码在日志/响应里可见） */
function usable() {
  const p = provider();
  return p !== 'none' && missingKeys(p).length === 0;
}

function describe() {
  const p = provider();
  return { provider: p, usable: usable(), missing: missingKeys(p), dev: p === 'dev' };
}

/* ---------- HTTP 小工具：超时 + 一次重试 ---------- */
async function post(url, init, retries) {
  let lastErr = null;
  for (let attempt = 0; attempt <= (retries == null ? RETRY : retries); attempt++) {
    try {
      const res = await fetch(url, Object.assign({}, init, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
      const text = await res.text();
      return { status: res.status, text: text };
    } catch (err) {
      lastErr = err;
      /* 超时/连接错误才重试；DNS 打错这种情况重试也没用，但代价只有一次，留着当兜底 */
    }
  }
  throw new SmsError('SMS_NETWORK', '短信网关连不上：' + (lastErr && lastErr.message ? lastErr.message : 'unknown'));
}

function hmac(key, data, enc) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(enc);
}

/* ---------- 腾讯云：TC3-HMAC-SHA256 ----------
   文档里的签名步骤：拼规范请求串 → 拼待签字符串 → 用 SecretKey 逐级派生密钥（日期→服务）→ 签名。
   这里不引 SDK，是为了让「签名算错」这种线上最常见的故障一眼能看懂。 */
async function sendTencent(opt) {
  const secretId = env('SMS_SECRET_ID');
  const secretKey = env('SMS_SECRET_KEY');
  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const region = env('SMS_REGION') || 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payload = JSON.stringify({
    PhoneNumberSet: ['+86' + opt.phone],
    SmsSdkAppId: env('SMS_SDK_APP_ID'),
    SignName: env('SMS_SIGN_NAME'),
    TemplateId: env('SMS_TEMPLATE_ID'),
    TemplateParamSet: [String(opt.code), String(Math.max(1, Math.floor((opt.ttl || 300) / 60)))]
  });

  const canonicalRequest = [
    'POST', '/', '',
    'content-type:application/json; charset=utf-8',
    'host:' + host,
    '',
    'content-type;host',
    crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
  ].join('\n');

  const scope = date + '/' + service + '/tc3_request';
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), scope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');

  const kDate = hmac('TC3' + secretKey, date);
  const kService = hmac(kDate, service);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  const authorization = 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + scope +
    ', SignedHeaders=content-type;host, Signature=' + signature;

  const r = await post('https://' + host, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Region': region,
      'X-TC-Timestamp': String(timestamp)
    },
    body: payload
  });

  let body = {};
  try { body = JSON.parse(r.text || '{}'); } catch (err) { /* 网关返回非 JSON，交给下面统一报错 */ }
  const resp = body.Response || {};
  if (resp.Error) {
    throw new SmsError(resp.Error.Code || 'SMS_PROVIDER_ERROR', resp.Error.Message || '腾讯云短信返回错误', 'http ' + r.status);
  }
  const st = (resp.SendStatusSet && resp.SendStatusSet[0]) || {};
  if (st.Code !== 'Ok') {
    throw new SmsError(st.Code || 'SMS_PROVIDER_ERROR', st.Message || '腾讯云短信未受理', 'http ' + r.status);
  }
  return { id: resp.RequestId || st.SerialNo || '' };
}

/* ---------- 阿里云：RPC 风格 + HMAC-SHA1 ----------
   阿里云老 API（dysmsapi 2017-05-25）走的是「参数排序 → 拼规范串 → HMAC-SHA1 → base64」，
   与新版 OpenAPI 的 v3 签名完全不同。这里用 RPC 版：它只需要 GET，签名算错时错误码也直白。 */
function percentEncode(s) {
  return encodeURIComponent(String(s))
    .replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

async function sendAliyun(opt) {
  const params = {
    AccessKeyId: env('SMS_ACCESS_KEY_ID'),
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: opt.phone,
    /* dysmsapi 只在 cn-hangzhou 提供服务；SMS_REGION 是给腾讯云用的，不能共用同一个变量，
       否则 .env 里写了 ap-guangzhou 会把阿里云的请求打到不存在的区域。 */
    RegionId: 'cn-hangzhou',
    SignName: env('SMS_SIGN_NAME'),
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: env('SMS_TEMPLATE_CODE'),
    TemplateParam: JSON.stringify({ code: String(opt.code) }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25'
  };

  const canonical = Object.keys(params).sort()
    .map(function (k) { return percentEncode(k) + '=' + percentEncode(params[k]); })
    .join('&');
  const stringToSign = 'GET&%2F&' + percentEncode(canonical);
  const signature = crypto.createHmac('sha1', env('SMS_ACCESS_KEY_SECRET') + '&')
    .update(stringToSign, 'utf8').digest('base64');

  const url = 'https://dysmsapi.aliyuncs.com/?Signature=' + percentEncode(signature) + '&' + canonical;
  const r = await post(url, { method: 'GET' });

  let body = {};
  try { body = JSON.parse(r.text || '{}'); } catch (err) { /* 同上 */ }
  if (body.Code !== 'OK') {
    throw new SmsError(body.Code || 'SMS_PROVIDER_ERROR', body.Message || '阿里云短信返回错误', 'http ' + r.status);
  }
  return { id: body.BizId || body.RequestId || '' };
}

/* ---------- 通用 webhook 网关 ----------
   给聚合商与自建网关留的统一出口：POST JSON，2xx 即视为受理。
   body: { phone, code, ttl, scene, sign }
   sign = HMAC-SHA256(rawBody, SMS_WEBHOOK_SECRET)，网关侧据此确认「这条真是鲸域发的」。
   为什么带签名：URL 一旦泄露（贴进工单、贴进聊天），没有签名就等于把发短信的能力借给了别人。 */
async function sendWebhook(opt) {
  const url = env('SMS_WEBHOOK_URL');
  const body = JSON.stringify({
    phone: opt.phone,
    code: String(opt.code),
    ttl: opt.ttl || 300,
    scene: opt.scene || 'verify'
  });
  const headers = { 'Content-Type': 'application/json' };
  const secret = env('SMS_WEBHOOK_SECRET');
  if (secret) headers['X-SMS-Sign'] = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const token = env('SMS_WEBHOOK_TOKEN');
  if (token) headers.Authorization = 'Bearer ' + token;

  const r = await post(url, { method: 'POST', headers: headers, body: body });
  if (r.status < 200 || r.status >= 300) {
    throw new SmsError('SMS_PROVIDER_ERROR', '短信网关返回 ' + r.status, String(r.text || '').slice(0, 200));
  }
  let id = '';
  try { id = (JSON.parse(r.text || '{}') || {}).id || ''; } catch (err) { /* 网关不返回 JSON 也正常 */ }
  return { id: id };
}

/* ---------- 对外入口 ---------- */
async function send(opt) {
  const o = opt || {};
  const phone = String(o.phone || '').replace(/\D/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new SmsError('SMS_BAD_PHONE', '手机号格式不对');
  const p = provider();
  if (p === 'none') throw new SmsError('SMS_NOT_CONFIGURED', '短信通道还没配置');
  const miss = missingKeys(p);
  if (miss.length) throw new SmsError('SMS_NOT_CONFIGURED', '短信通道缺配置：' + miss.join(', '));

  if (p === 'dev') {
    /* dev 不联网：码由 phone.js 回显，这里只负责「算发过」 */
    return { delivered: true, channel: 'dev', id: 'dev-' + Date.now() };
  }
  /* 传给各家的号码必须是上面归一化后的 digits —— 否则 "138 0013 8000" 这种写法
     能过本地的 /^1[3-9]\d{9}$/ 校验（已 strip），却把带空格的串原样塞进云厂商的 PhoneNumberSet。 */
  const target = Object.assign({}, o, { phone: phone });
  const r = p === 'tencent' ? await sendTencent(target)
    : p === 'aliyun' ? await sendAliyun(target)
      : await sendWebhook(target);
  return { delivered: true, channel: p, id: (r && r.id) || '' };
}

module.exports = {
  send,
  provider,
  usable,
  describe,
  missingKeys,
  SmsError,
  TIMEOUT_MS
};
