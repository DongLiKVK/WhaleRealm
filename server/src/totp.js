/**
 * 后台管理 · TOTP 两步验证（RFC 6238）
 * 契约：docs/admin-api.md 第 1.1 节
 *
 * 为什么自己实现、不引第三方 OTP 库：
 *   算法只有 HMAC-SHA1 + 动态截断这一小段，标准库 crypto 足够；
 *   少一个依赖，生产机上就少一条升级/供应链风险。
 *   QR 编码用 qrcode-generator（纯 JS、无原生依赖），只负责把 otpauth URI 画成 SVG。
 *
 * 安全口径：
 * 1. secret 落库前用 AES-256-GCM 加密，密钥来自 ADMIN_TOTP_KEY（不与 JWT 共用）。
 * 2. 验证窗口 ±1 步（30s/步），且必须大于该账号上次成功使用的 step，防同码重放。
 * 3. 恢复码只存 sha256，明文只在启用成功时返回一次；每个只能用一次。
 * 4. 比较验证码用 timingSafeEqual，避免时序侧信道。
 */
'use strict';

const crypto = require('crypto');
const qrcode = require('qrcode-generator');

const ISSUER = '鲸域控制台';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_COUNT = 8;

/* ---------- base32（RFC 4648，无填充） ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!s) return Buffer.alloc(0);
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const idx = B32.indexOf(s[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ---------- TOTP ---------- */
function randomSecret(bytes) {
  return base32Encode(crypto.randomBytes(bytes || 20));
}

function hotp(secret, counter, digits) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  if (!key.length) throw new Error('TOTP secret 为空');
  const n = Number(counter);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('TOTP counter 非法');
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(n / 0x100000000), 0);
  buf.writeUInt32BE(n >>> 0, 4);
  const mac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const d = digits || DIGITS;
  return String(bin % Math.pow(10, d)).padStart(d, '0');
}

function stepAt(atSeconds) {
  const at = Number.isFinite(Number(atSeconds)) ? Number(atSeconds) : Math.floor(Date.now() / 1000);
  return Math.floor(at / STEP_SECONDS);
}

function totp(secret, atSeconds) {
  return hotp(secret, stepAt(atSeconds), DIGITS);
}

function sameCode(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * 校验 6 位验证码。
 * 返回 { ok, step, offset }；step 是命中的时间步，调用方应写回 totp_last_step。
 * lastStep 存在时只接受更晚的步，避免「同一个码在 30 秒内被用两次」。
 */
function verifyTotp(secret, code, opts) {
  const o = opts || {};
  const clean = String(code == null ? '' : code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false, reason: 'format' };
  const nowStep = stepAt(o.at);
  const window = Number.isInteger(o.window) ? Math.min(2, Math.max(0, o.window)) : WINDOW;
  const lastStep = Number(o.lastStep || 0);
  for (let offset = -window; offset <= window; offset++) {
    const step = nowStep + offset;
    if (step < 0) continue;
    if (lastStep && step <= lastStep) continue;
    if (sameCode(hotp(secret, step, DIGITS), clean)) {
      return { ok: true, step, offset };
    }
  }
  return { ok: false, reason: 'mismatch' };
}

function otpauthUri(secret, account) {
  const label = ISSUER + ':' + String(account || 'admin');
  const params = new URLSearchParams({
    secret: String(secret || ''),
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS)
  });
  return 'otpauth://totp/' + encodeURIComponent(label) + '?' + params.toString();
}

/** 把 otpauth URI 画成内联 SVG（不落盘、不引外部图片，CSP 下可直接插进 DOM） */
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text || ''), 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

/* ---------- secret 加密 ---------- */
function masterKey() {
  const material = process.env.ADMIN_TOTP_KEY || process.env.JWT_SECRET || '';
  if (!material) {
    if (String(process.env.NODE_ENV || '') === 'production') {
      throw new Error('ADMIN_TOTP_KEY 未配置，拒绝以开发默认值加密 TOTP secret');
    }
    return crypto.createHash('sha256').update('jingyu-admin-totp-dev-only').digest();
  }
  return crypto.createHash('sha256').update('jingyu-admin-totp-v1|' + material).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v1:' + iv.toString('base64url') + ':' + tag.toString('base64url') + ':' + ct.toString('base64url');
}

function decryptSecret(blob) {
  const s = String(blob || '');
  if (!s) return '';
  // 兼容早期直接存 base32 的行（未来手工迁移时不用先跑脚本）
  if (!s.startsWith('v1:')) return s;
  const parts = s.split(':');
  if (parts.length !== 4) throw new Error('TOTP secret 格式不正确');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ct = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('TOTP secret 头部损坏');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/* ---------- 恢复码 ---------- */
function normalizeRecovery(code) {
  return String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatRecovery(raw) {
  const s = normalizeRecovery(raw);
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : s;
}

function hashRecovery(code) {
  return crypto.createHash('sha256').update('jingyu-admin-recovery-v1|' + normalizeRecovery(code)).digest('hex');
}

function validRecoveryFormat(code) {
  return /^[A-Z0-9]{8}$/.test(normalizeRecovery(code));
}

function randomRecoveryCode() {
  let out = '';
  for (let i = 0; i < 8; i++) out += RECOVERY_ALPHABET[crypto.randomInt(0, RECOVERY_ALPHABET.length)];
  return out.slice(0, 4) + '-' + out.slice(4);
}

function generateRecoveryCodes(count) {
  const n = Math.max(1, Math.min(20, Number(count) || RECOVERY_COUNT));
  const seen = new Set();
  const out = [];
  while (out.length < n) {
    const plain = randomRecoveryCode();
    const hash = hashRecovery(plain);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({ plain, hash });
  }
  return out;
}

module.exports = {
  ISSUER,
  STEP_SECONDS,
  DIGITS,
  WINDOW,
  RECOVERY_COUNT,
  base32Encode,
  base32Decode,
  randomSecret,
  hotp,
  totp,
  stepAt,
  verifyTotp,
  otpauthUri,
  qrSvg,
  encryptSecret,
  decryptSecret,
  normalizeRecovery,
  formatRecovery,
  hashRecovery,
  validRecoveryFormat,
  generateRecoveryCodes
};
