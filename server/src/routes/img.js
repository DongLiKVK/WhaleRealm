'use strict';
/**
 * GET /api/img?u=<原始图片地址>
 *
 * README 正文里的配图统一走这里（见 server/src/img-proxy.js 里的取舍说明）。
 * 契约刻意保持「像一张图」：成功回二进制 + 长缓存头，失败回 4xx/5xx JSON，
 * 前端 <img> 拿不到图就自己藏起来，不做额外处理。
 */

const { fetchImage } = require('../img-proxy');

const FAIL_STATUS = {
  BAD_URL: 400,
  HOST_NOT_ALLOWED: 403,
  UPSTREAM_STATUS: 502,
  NOT_IMAGE: 502,
  TOO_LARGE: 413,
  TIMEOUT: 504,
  FETCH_FAILED: 502,
};

module.exports = async function (fastify) {
  /* 同一张图被一页里多处引用时，只打一次上游 */
  const inflight = new Map();

  async function serve(req, reply) {
    const raw = String(req.query && req.query.u || '').trim();
    if (!raw) {
      reply.code(400);
      return { ok: false, error: { code: 'BAD_URL', message: '缺少 u 参数' } };
    }

    const key = raw;
    let job = inflight.get(key);
    if (!job) {
      job = fetchImage(raw).then(function (r) { inflight.delete(key); return r; }, function (e) {
        inflight.delete(key);
        return { ok: false, code: 'FETCH_FAILED', message: String(e && e.message || e) };
      });
      inflight.set(key, job);
    }
    const got = await job;

    if (!got.ok) {
      reply.code(FAIL_STATUS[got.code] || 502);
      /* 失败不要长缓存：放行规则会调整（例如从固定白名单改成「公网可达」），
     旧结论被 CDN 缓存几小时，用户看到的就是一堆碎图标。只给 60 秒，让边缘自愈。 */
  reply.header('Cache-Control', 'public, max-age=60');
  reply.header('Cloudflare-CDN-Cache-Control', 'public, max-age=60');
      return { ok: false, error: { code: got.code, message: got.message } };
    }

    reply.header('Content-Type', got.contentType || 'application/octet-stream');
    reply.header('Content-Length', String(got.bytes));
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.header('Cloudflare-CDN-Cache-Control', 'public, max-age=604800');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    return reply.send(got.body);
  }

  const opts = { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } };
  /* 两种写法都收：/api/img?u=... 与 /api/img/<文件名>?u=...
     带文件名那一路是为了让 Cloudflare 认出扩展名、按静态资源缓存（CF 默认不缓存无扩展名的响应），
     文件名本身不参与取图，只当缓存提示用。 */
  fastify.get('/img', opts, serve);
  fastify.get('/img/:name', opts, serve);
};
