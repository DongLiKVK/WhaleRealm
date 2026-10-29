/**
 * 后台管理 · 插件条目审核
 *
 * 这里管的是条目库的「上架 / 驳回 / 下架」：status 一旦不是 published，公开列表与条目页都会
 * 立刻看不到它（routes/forums.js 的 GET /plugins 已经把条件写进 WHERE）。所以这条路由是整个
 * 举报闭环的出口 —— 举报处理里点「下架被举报对象」，最终落到的就是这里的 status。
 *
 * 为什么不物理删除：条目是索引数据（slug / stars / license 都指向真实第三方仓库），删掉之后
 * 有人重新提交同样的 slug 会撞 UNIQUE；而下架只需要它在公开面消失，行本身要留着做审计与恢复。
 * 因此所有动作都只改 status + review_note + reviewed_by/at。
 *
 * 为什么列表要显式 LIMIT/OFFSET 且必须带 counts：全库 6700+ 条，一页 20 条是唯一能用的浏览方式；
 * counts 是「在当前筛选条件下」的五态计数，前端 tab 上的数字必须与点进去的列表对得上。
 */
'use strict';

const { db, now, parseJson } = require('../db');
const { fail } = require('../http');
const {
  requirePermission,
  writeAdminLog,
  paging,
  likeTerm,
  LIKE_ESC,
  orderBy
} = require('../admin-guard');

const PLUGIN_STATUS = ['published', 'pending', 'rejected', 'hidden'];

const SORTS = {
  'new': 'p.updated_at DESC, p.id DESC',
  hot: 'p.hot DESC, p.stars DESC, p.id DESC',
  stars: 'p.stars DESC, p.id DESC'
};

/** 批量动作 → 目标状态 */
const BATCH_STATUS = { publish: 'published', reject: 'rejected', hide: 'hidden' };
const BATCH_VERB = { publish: '上架', reject: '驳回', hide: '下架' };

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > (max || 2147483647)) return 0;
  return n;
}

/** plugins 行 → 后台契约。字段与公开 pluginShape 保持同名，后台表格直接复用列定义。
 *  note 类字段（reviewNote / reviewedAt / reviewedBy）只在这里出现，公开接口不会吐。 */
function shapePlugin(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.slug,
    icon: p.icon,
    grad: p.grad,
    cat: p.cat,
    desc: p.desc,
    author: p.author_name || '',
    authorId: p.author_id || 0,
    ver: p.ver,
    stars: p.stars,
    installs: p.installs,
    tags: parseJson(p.tags, []),
    hot: !!p.hot,
    license: p.license,
    repo: p.repo,
    homepage: p.homepage,
    tier: p.tier,
    source: p.source,
    claimed: !!p.claimed,
    status: p.status || 'published',
    reviewNote: p.review_note || '',
    reviewedAt: p.reviewed_at || 0,
    reviewedBy: p.reviewed_by || 0,
    updatedAt: p.updated_at || 0,
    createdAt: p.created_at || 0
  };
}

const PLUGIN_SELECT =
  'SELECT p.*, u.name AS author_name FROM plugins p LEFT JOIN users u ON u.id = p.author_id';

const STMT = {
  byId: db.prepare(PLUGIN_SELECT + ' WHERE p.id = ?'),
  setStatus: db.prepare('UPDATE plugins SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = updated_at WHERE id = ?')
};

module.exports = async function adminPluginRoutes(fastify) {
  /* 列表：status / q / cat / sort / page。
     q 只搜 slug、desc、tags、repo —— desc 与 tags 是索引里最像「人话」的两列，
     搜 slug 是为了运营在知道包名时能一击命中。 */
  fastify.get('/plugins', { preHandler: requirePermission('plugin.view') }, async (req, reply) => {
    const q0 = req.query || {};

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && PLUGIN_STATUS.indexOf(status) < 0) {
      return bad(reply, 'status 只能是 all、published、pending、rejected、hidden');
    }

    const sortKey = q0.sort == null || q0.sort === '' ? 'new' : String(q0.sort);
    if (!Object.prototype.hasOwnProperty.call(SORTS, sortKey)) return bad(reply, 'sort 只能是 new、hot、stars');

    const { page, pageSize, offset } = paging(q0);

    const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
    if (kw.length > 80) return bad(reply, '搜索词最多 80 个字');

    const cat = typeof q0.cat === 'string' ? q0.cat.trim() : '';
    if (cat.length > 40) return bad(reply, '分类名太长');

    const parts = [];
    const params = [];
    if (kw) {
      const like = likeTerm(kw);
      parts.push('(p.slug LIKE ? ' + LIKE_ESC + ' OR p.desc LIKE ? ' + LIKE_ESC + ' OR p.tags LIKE ? ' + LIKE_ESC + ' OR p.repo LIKE ? ' + LIKE_ESC + ')');
      params.push(like, like, like, like);
    }
    if (cat) {
      parts.push('p.cat = ?');
      params.push(cat);
    }

    const baseWhere = parts.length ? ' WHERE ' + parts.join(' AND ') : '';

    let where = baseWhere;
    let whereParams = params;
    if (status !== 'all') {
      where = (baseWhere ? baseWhere + ' AND' : ' WHERE') + ' p.status = ?';
      whereParams = params.concat([status]);
    }

    const total = db.prepare('SELECT COUNT(*) AS n FROM plugins p' + where).get(...whereParams).n;

    const rows = db.prepare(
      PLUGIN_SELECT + where + ' ORDER BY ' + orderBy(SORTS, sortKey, 'new') + ' LIMIT ? OFFSET ?'
    ).all(...whereParams, pageSize, offset);

    /* 五态计数：用 baseWhere（不含 status）才能得到「当前搜索/分类条件下」的全量与各态分布。
       全部进 SQL 一次算完 —— 6700 行上分五次 COUNT 是五倍的表扫描。 */
    const c = db.prepare(
      'SELECT COUNT(*) AS all_n,' +
      " SUM(CASE WHEN p.status = 'published' THEN 1 ELSE 0 END) AS pub," +
      " SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) AS pend," +
      " SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) AS rej," +
      " SUM(CASE WHEN p.status = 'hidden' THEN 1 ELSE 0 END) AS hid" +
      ' FROM plugins p' + baseWhere
    ).get(...params);

    return {
      ok: true,
      data: {
        items: rows.map(shapePlugin),
        total,
        page,
        pageSize,
        counts: {
          all: c.all_n || 0,
          published: c.pub || 0,
          pending: c.pend || 0,
          rejected: c.rej || 0,
          hidden: c.hid || 0
        }
      }
    };
  });

  /* 分类统计：前端筛选下拉的数据源。只统计已发布，因为运营关心的是「公开面里还剩多少」。 */
  fastify.get('/plugins/cats', { preHandler: requirePermission('plugin.view') }, async () => {
    const rows = db.prepare(
      "SELECT cat, COUNT(*) AS n FROM plugins WHERE status = 'published' GROUP BY cat ORDER BY n DESC, cat ASC"
    ).all();
    return { ok: true, data: { cats: rows.map((r) => ({ cat: r.cat || '', count: r.n })) } };
  });

  /* 单条改状态。note 上限 200 字：这是给别人看的处理理由，不是正文。
     日志里同时记 before / after，出问题时能回答「谁在什么时候把它下架了」。 */
  fastify.patch('/plugins/:id', { preHandler: requirePermission('plugin.edit') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个条目');

    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个条目');

    const body = req.body || {};
    const status = String(body.status || '').trim();
    if (PLUGIN_STATUS.indexOf(status) < 0) {
      return bad(reply, 'status 只能是 published、pending、rejected、hidden');
    }

    const note = String(body.note == null ? '' : body.note).trim().slice(0, 200);
    const before = row.status || 'published';
    if (before === status && !note) return { ok: true, data: { plugin: shapePlugin(row) } };

    const at = now();
    const who = req.admin ? req.admin.id : 0;
    STMT.setStatus.run(status, note, who, at, id);

    writeAdminLog(req, {
      action: 'plugin.review',
      targetType: 'plugin',
      targetId: id,
      summary: '插件「' + row.slug + '」' + before + ' → ' + status,
      detail: { before: { status: before }, after: { status: status, note: note } }
    });

    return { ok: true, data: { plugin: shapePlugin(STMT.byId.get(id)) } };
  });

  /* 批量：ids 上限 100（与动态批量一致）。为什么逐个 UPDATE 而不拼一条 IN：
     每条都要带自己的 note 与 reviewed_by，而 SQLite 没有「按 id 分别赋值」的批量 UPDATE；
     用事务包住 100 条同步 UPDATE 在现代机器上是毫秒级，不值得为它上临时表。 */
  fastify.post('/plugins/batch', { preHandler: requirePermission('plugin.edit') }, async (req, reply) => {
    const body = req.body || {};
    const action = String(body.action || '').trim();
    const next = BATCH_STATUS[action];
    if (!next) return bad(reply, 'action 只能是 publish、reject、hide');

    const raw = Array.isArray(body.ids) ? body.ids : [];
    const ids = [];
    const seen = new Set();
    for (const v of raw) {
      const n = readId(v);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      ids.push(n);
    }
    if (!ids.length) return bad(reply, '请先选择要处理的条目');
    if (ids.length > 100) return bad(reply, '一次最多处理 100 条');

    const note = String(body.note == null ? '' : body.note).trim().slice(0, 200);
    const at = now();
    const who = req.admin ? req.admin.id : 0;

    let changed = 0;
    const run = db.transaction(() => {
      for (const id of ids) {
        const row = STMT.byId.get(id);
        if (!row) continue;
        STMT.setStatus.run(next, note, who, at, id);
        changed += 1;
      }
    });
    run();

    writeAdminLog(req, {
      action: 'plugin.batch_review',
      targetType: 'plugin',
      targetId: 0,
      summary: '批量' + BATCH_VERB[action] + '插件 ' + changed + ' 条',
      detail: { after: { action: action, status: next, ids: ids, note: note } }
    });

    return { ok: true, data: { changed, status: next } };
  });
}

module.exports.shapePlugin = shapePlugin;
module.exports.PLUGIN_SELECT = PLUGIN_SELECT;
module.exports.PLUGIN_STATUS = PLUGIN_STATUS;
