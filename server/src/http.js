/**
 * HTTP 层通用小工具：统一响应形状、错误码表、手机号格式化。
 * 为什么单独抽一个文件：auth / phone / oauth 三个路由要用同一套 code+message，
 * 抄三份迟早走形；而前端 js/auth.js 的 MSG 是逐字比对的，所以必须只有一个来源。
 */
'use strict';

/* ---------- 错误码表 ----------
   前 12 条与前端 js/auth.js 的 MSG 逐字对齐，message 不要改；
   手机号 / 第三方登录是本轮新增，前端接上时照这里的字面量抄。 */
const MSG = {
  BAD_EMAIL: '邮箱格式不对，检查一下有没有漏掉 @ 或域名',
  WEAK_PASSWORD: '密码至少 8 位',
  PASSWORD_TOO_LONG: '密码太长了，200 位以内',
  NAME_REQUIRED: '昵称不能为空',
  EMAIL_TAKEN: '这个邮箱已经注册过了，直接登录或换个邮箱',
  NOT_REGISTERED: '这个邮箱还没注册，先去注册一个账号',
  BAD_CREDENTIALS: '邮箱或密码不对',
  ALREADY_AUTHED: '当前已经登录，同一时间只能登录一个账户；要换账号请先退出登录',
  ALREADY_ONLINE: '这个账号已经在另一处登录，同一时间只允许一条会话',
  AUTH_LOCKED: '登录状态已建立，不能在本会话内切换账户；要换账号请先退出登录',
  NOT_AUTHED: '请先登录',
  TOO_MANY: '尝试太频繁了，过几分钟再试',
  AUTH_LOCKED_OUT: '登录失败次数过多，这个账号暂时锁定了，稍后再试',

  BAD_PHONE: '手机号格式不对，请填 11 位大陆手机号',
  CODE_EXPIRED: '验证码过期了，重新获取一个',
  CODE_WRONG: '验证码不对，检查一下',
  CODE_TOO_MANY: '验证码错误次数太多了，重新获取一个',
  PHONE_TAKEN: '这个手机号已经绑定到别的账号了，一个号码只能绑一个账号',
  PHONE_REQUIRED: '先绑定并验证手机号，再继续操作',

  OAUTH_UNKNOWN_PROVIDER: '不认识的第三方登录渠道',
  OAUTH_NOT_CONFIGURED: '还没配置这个第三方登录渠道',
  OAUTH_STATE: '登录状态校验失败，请重新发起授权',
  OAUTH_DENIED: '你取消了第三方授权',
  OAUTH_FAILED: '第三方登录服务暂时不可用，稍后再试'
};

/**
 * 统一失败响应：{ ok:false, error:{ code, message }, data? }
 * message 默认取 MSG[code]，需要带上具体信息（比如渠道名）时用第五个参数覆盖。
 */
function fail(reply, status, code, data, message) {
  const body = { ok: false, error: { code, message: message || MSG[code] || '请求有误' } };
  if (data) body.data = data;
  return reply.code(status).send(body);
}

/** 限流超限时的响应：@fastify/rate-limit 的 errorResponseBuilder 用它，保持同形
 *  ⚠️ 插件内部是 throw errorResponseBuilder(req, ctx) —— 返回值会被当成 Error 抛出。
 *  早先这里只返回普通对象（没有 statusCode），全局 errorHandler 里 err.statusCode 就是
 *  undefined，于是限流被记成 500「服务器出了点问题」，前端看不到「尝试太频繁了」。
 *  所以必须返回带 statusCode 的 Error 实例，让错误处理链能识别 429 语义。 */
function rateLimitError(req, ctx) {
  const err = new Error(MSG.TOO_MANY);
  err.statusCode = (ctx && ctx.statusCode) || 429;
  err.code = 'TOO_MANY';
  return err;
}

/* ---------- 手机号 ---------- */

/** 11 位大陆手机号，不做运营商号段全量校对 */
const PHONE_RE = /^1[3-9]\d{9}$/;

function validPhone(v) {
  return typeof v === 'string' && PHONE_RE.test(v);
}

/** 打码：前 3 后 4，中间 ****；号码不合法就整串打掉，绝不回显完整号码 */
function maskPhone(v) {
  const s = typeof v === 'string' ? v : '';
  if (!validPhone(s)) return '';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

module.exports = { MSG, fail, rateLimitError, validPhone, maskPhone, PHONE_RE };