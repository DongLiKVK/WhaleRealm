/**
 * 鲸域社区 · 后端入口
 * 启动顺序：环境变量 → Fastify 实例 → 插件 → 路由 → 监听
 * 只监听 127.0.0.1:3000，公网访问一律经 Nginx 反代
 */
'use strict';

const path = require('path');
const fs = require('fs');

// 手动加载 .env，避免多装一个 dotenv 依赖
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const Fastify = require('fastify');
const cookie = require('@fastify/cookie');
const jwt = require('@fastify/jwt');
const rateLimit = require('@fastify/rate-limit');
const websocket = require('@fastify/websocket');

const { DB_PATH } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : undefined
  },
  // 上传走 COS，这里把原始 body 上限压到 1MB，防止有人拿 JSON 塞二进制
  bodyLimit: 1048576,
  trustProxy: true
});

async function main() {
  // ---- 插件注册 ----
  await fastify.register(cookie);

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me'
  });

  await fastify.register(rateLimit, {
    global: false,           // 只对显式声明的路由限流，读接口不限
    max: 100,
    timeWindow: '1 minute'
  });

  await fastify.register(websocket);

  // ---- 全局错误处理：任何异常都返回统一格式，且不泄露堆栈 ----
  fastify.setErrorHandler((err, req, reply) => {
    // 有些插件（历史写法）会 throw 一个纯对象而不是 Error；先归一化，别让它掉进 500
    let e = err;
    if (e && typeof e === 'object' && !(e instanceof Error) && e.error && e.error.code) {
      const wrapped = new Error(e.error.message || '请求有误');
      wrapped.code = e.error.code;
      wrapped.statusCode = e.statusCode || 429;
      e = wrapped;
    }
    const status = e.statusCode || 500;
    // 5xx 才当事故记 error 日志；4xx 是正常的业务拒绝，记 warn 免得淹没真实故障
    if (status >= 500) req.log.error({ err: e }, '服务端异常');
    else if (status >= 400) req.log.warn({ code: e.code, status }, '请求被拒');

    // 限流超限：@fastify/rate-limit 抛出 429（errorResponseBuilder 返回的 Error），
    // 这里统一成前端的 TOO_MANY，保持 { ok:false, error:{code,message} } 形状。
    // 注意别再写死 message，带上剩余时间前端才好提示。
    if (status === 429) {
      const reset = Number(reply.getHeader('retry-after')) || 0;
      return reply.code(429).send({
        ok: false,
        error: { code: e.code || 'TOO_MANY', message: e.message || '尝试太频繁了，过几分钟再试' },
        data: reset ? { retryAfter: reset } : undefined
      });
    }

    // 校验错误（fastify schema）单独给可读提示
    if (e.validation) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: '提交的数据格式不对：' + e.message }
      });
    }

    return reply.code(status).send({
      ok: false,
      error: {
        code: e.code || (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
        message: status >= 500 ? '服务器出了点问题，稍后再试' : (e.message || '请求有误')
      }
    });
  });

  // ---- CORS：只允许本站来源（前端与 API 同域时其实用不到，留着方便本地调试） ----
  fastify.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && SITE_ORIGIN && origin === SITE_ORIGIN.replace(/\/+$/, '')) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return reply.code(204).send();
    }
  });

  // ---- 健康检查：给 systemd / nginx / 部署脚本用 ----
  fastify.get('/healthz', async () => ({ ok: true, data: { status: 'alive', uptime: process.uptime() } }));
  fastify.get('/api/healthz', async () => ({
    ok: true,
    data: {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      db: DB_PATH,
      cos: !!(process.env.COS_SECRET_ID && process.env.COS_BUCKET)
    }
  }));

  // ---- 业务路由 ----
  await fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
  // 手机号认证：/api/auth/phone/send|verify|state（均需已登录，号码永远只回打码值）
  await fastify.register(require('./routes/phone'), { prefix: '/api/auth/phone' });
  // 第三方登录骨架：/api/auth/oauth/providers|:provider/start|:provider/callback
  // 未配置对应 OAUTH_*_CLIENT_ID 时一律 501 可读原因，不会 500，也不阻断启动
  await fastify.register(require('./routes/oauth'), { prefix: '/api/auth/oauth' });
  await fastify.register(require('./routes/posts'), { prefix: '/api' });
  await fastify.register(require('./routes/comments'), { prefix: '/api' });
  await fastify.register(require('./routes/upload'), { prefix: '/api' });
  await fastify.register(require('./routes/forums'), { prefix: '/api' });
  // chat 里的 /ws 和 /api/messages 前缀不同，拆成两个注册
  await fastify.register(require('./routes/chat'));

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`鲸域后端已启动 http://${HOST}:${PORT}`);
}

// ---- 优雅退出：systemd restart 时先把连接收干净 ----
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      await fastify.close();
      process.exit(0);
    } catch (e) {
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
