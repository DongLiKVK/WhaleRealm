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
  /* 公开用户资料：空间页要显示别人的名字和头像（只读、只吐 publicUser） */
  await fastify.register(require('./routes/users'), { prefix: '/api' });
  await fastify.register(require('./routes/posts'), { prefix: '/api' });
  await fastify.register(require('./routes/comments'), { prefix: '/api' });
  await fastify.register(require('./routes/upload'), { prefix: '/api' });
  await fastify.register(require('./routes/forums'), { prefix: '/api' });
  /* 举报通道：POST /api/reports。公开可提交（未登录也收），带 IP 限流；
     后台的处理入口在下面的 admin-reports 里。没有这条路由，站内所有「举报」按钮
     都只是 toast —— 侵权与恶意代码的通知就永远到不了人手里。 */
  await fastify.register(require('./routes/reports'), { prefix: '/api' });
  /* README 配图代理：/api/img?u=... 。生产 CSP 只允许本站图片，GitHub raw 在国内也不通，
     所以条目页里的图统一由服务端取一次、落盘缓存再回给浏览器。 */
  await fastify.register(require('./routes/img'), { prefix: '/api' });
  /* 会员赞助：公开概览 / 赞助者墙 + 登录用户的会员中心与订单。
     金额一律整数分、时间一律 Unix 秒；沙箱支付只在演示环境开放。 */
  await fastify.register(require('./routes/membership'), { prefix: '/api/membership' });
  // 会员后台：KPI / 订单补单退款 / 计划改价 / 手动开通 / CSV（requireAuth + isAdmin 双重校验）
  await fastify.register(require('./routes/admin-membership'), { prefix: '/api/admin/membership' });
  /* 独立后台管理系统：自己的账号体系（admin_accounts + RBAC），与站点用户完全隔离。
     路径按契约第 3 节拆开注册，前缀错一个字母整套前端就 404，所以逐个写清楚。 */
  await fastify.register(require('./routes/admin-auth'), { prefix: '/api/admin/auth' });
  await fastify.register(require('./routes/admin-stats'), { prefix: '/api/admin/stats' });
  /* 这五个插件内部的路径自带资源名（'/posts'、'/users'、'/rewards'、'/roles'、'/logs'），
     所以统一挂 '/api/admin'：再套一层 '/posts' 前缀会变成 /api/admin/posts/posts。
     roles 插件同时提供 /roles、/admins、/permissions 三组，本来也只能共用这层前缀。 */
  await fastify.register(require('./routes/admin-posts'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-users'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-rewards'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-plugins'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-reports'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-roles'), { prefix: '/api/admin' });
  await fastify.register(require('./routes/admin-logs'), { prefix: '/api/admin' });
  /* chat 里的 /ws 和 /api/messages 前缀不同，必须拆成两个注册。
     之前这里只注册了一次（而且没给前缀），于是 /messages/:uid 落在了根路径上，
     前端要的 /api/messages/:uid 永远是 404 Route not found —— 私信整条链路是死的。 */
  const chat = require('./routes/chat');
  await fastify.register(chat, { prefix: '/api' });   // → /api/messages/:uid
  await fastify.register(chat.ws);                    // → /ws（根路径，nginx 单独转发）

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`鲸域后端已启动 http://${HOST}:${PORT}`);

  /* 安装命令索引预热：条目页那颗胶囊要它，不预热的话每个进程重启后
     第一个条目请求会漏一次（退回推断文案）。装载失败不阻塞启动。 */
  require('./awesome-catalog').warm().then((map) => {
    const n = map && map.size ? map.size : 0;
    fastify.log.info(n ? `安装命令索引就绪（${n} 个键）` : '安装命令索引为空，胶囊退回推断文案');
  }).catch(() => {});
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
