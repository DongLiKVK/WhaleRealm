# 任务：为「鲸域」社区前端接入真实后端，并完成云上部署准备

> 这份提示词是自包含的，请完整阅读后再动手。项目现状、架构决策、技术约束都写在下面，不需要额外询问背景。

## 一、项目现状

**路径**：`C:\Users\Administrator\Documents\qqspace-dsh\`

这是一个仿 QQ 空间风格的开发者社区前端，名字叫「鲸域」。当前状态：

- **纯静态，零后端**：`fetch` 0 处、`XMLHttpRequest` 0 处、`WebSocket` 0 处
- 所有数据是 `js/data.js` 里的**硬编码假数据**（30 KB）
- 状态只存在 localStorage（主题切换等）
- 无构建流程、无依赖、无 package.json

文件结构：

```
index.html            5.3 KB   入口，含内联主题守卫脚本
css/app.css         120.7 KB   全部样式，无图片/字体依赖，图标全是内联 SVG
js/brand.js           2.7 KB   品牌相关
js/data.js           29.7 KB   假数据（要被替换）
js/app.js           161.0 KB   全部业务逻辑与渲染
deploy/build.mjs              已写好的构建脚本（内容哈希）
deploy/nginx.conf             已写好的服务器配置
deploy/README.md              部署手册
```

**前端质量已经不错，不要重写 UI。** 任务是把数据源从 `data.js` 换成真实 API。

## 二、目标架构

动静分离，静态资源全部走 CDN，服务器只处理 API。

```
www.example.com  ──►  CDN  ──►  COS（html / css / js）
api.example.com  ──►  云服务器（API + WebSocket）
                       │
                       └──►  SQLite（起步）
                       └──►  COS（图片直传，不经过服务器）
```

**服务器**：腾讯云轻量应用服务器，上海地域，2 核 4G，5M 带宽，60GB SSD，**500GB 月流量**，Ubuntu 22.04 LTS。

**COS**：上海（华东）地域，与服务器同地域，保证内网访问免流量费。私有读写。

## 三、技术栈（已定，不要换）

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js 20 LTS | 与前端同语言 |
| Web 框架 | **Fastify 4** | 比 Express 快，内置 schema 校验，内存占用低 |
| 数据库 | **better-sqlite3**（WAL 模式） | 2核4G 下省内存，起步够用 |
| 实时通信 | `@fastify/websocket` | 聊天模块 |
| 鉴权 | `@fastify/cookie` + JWT | 无状态 |
| 对象存储 | `cos-nodejs-sdk-v5` | 只用来生成预签名 URL |
| 进程管理 | **systemd** | 不用 Docker，轻量服务器直接跑 |

## 四、硬性技术约束（违反任何一条都算不合格）

### 1. 图片必须前端直传 COS，绝对不能经过服务器

服务器只提供一个接口签发预签名 URL，**全程不接触图片二进制数据**。

原因：5M 带宽传一张 2MB 图要 3.2 秒，10 个人同时发图就堵死。走中转的话，整个动静分离方案就白做了。

```
浏览器 ──①请求签名──► 服务器（返回预签名 URL，几百字节）
浏览器 ──②PUT 直传──► COS（不经过服务器）
浏览器 ──③发帖──► 服务器（只带 COS key）
```

### 2. 展示一律用缩略图，禁止原图直出

用 COS 图片样式固化 URL，不要在代码里动态拼参数：

```
https://img.example.com/u/2026/10/abc123.jpg?style=thumb
```

| 样式名 | 参数 | 用途 |
|---|---|---|
| `thumb` | `imageMogr2/thumbnail/750x/format/webp/quality/85` | 动态流 |
| `thumb-sm` | `imageMogr2/thumbnail/320x/format/webp/quality/80` | 列表 |
| `origin` | 不处理 | 点开看大图 |

原图直出会让流量成本从每月 ¥15 涨到 ¥283。

### 3. GIF 必须转 WebP 动图

- 单张限制 **5 MB**、时长 **10 秒**
- 上传后生成 800px 的 WebP 动图版本（约 400 KB，比原 GIF 省 92%）
- **不要用 AVIF 动图**，Safari 支持不完整

### 4. 前端上传前必须压缩

静态图长边限制 1920px、质量 0.85，平均从 4 MB 压到 1.5 MB。用 canvas 在浏览器里做，不要用服务器转码。

### 5. 静态资源必须带内容哈希

`deploy/build.mjs` 已经实现了，直接用它构建，不要改回固定文件名。否则 CDN 长缓存后更新不生效。

### 6. 服务器 500GB 月流量是硬上限

任何图片、视频都不得经由服务器中转，否则几天就烧完。

## 五、要交付的内容

### 1. 后端服务 `server/`

```
server/
├── package.json
├── src/
│   ├── index.js          入口
│   ├── db.js             SQLite 初始化 + 迁移
│   ├── schema.sql        建表语句
│   ├── auth.js           JWT 鉴权
│   └── routes/
│       ├── auth.js
│       ├── posts.js
│       ├── comments.js
│       ├── upload.js     预签名 URL
│       ├── forums.js
│       └── chat.js       WebSocket
└── .env.example
```

### 2. 数据库 schema

至少覆盖：`users`、`posts`、`post_images`、`comments`、`likes`、`forums`、`threads`、`plugins`、`messages`。

要求：
- 用 `INTEGER PRIMARY KEY AUTOINCREMENT` 做主键
- 时间统一存 **Unix 秒**（INTEGER），不要存字符串
- 外键加 `ON DELETE CASCADE`
- 需要索引的字段：`posts.created_at`、`comments.post_id`、`messages.to_user`

### 3. API 接口

```
POST   /api/auth/register        注册（邮箱 + 密码，bcrypt 哈希）
POST   /api/auth/login           登录，返回 httpOnly cookie
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/feed?cursor=&limit=  动态流，游标分页
POST   /api/posts                发动态（body 带 images: [{key, w, h, type}]）
GET    /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/like       点赞 / 取消
GET    /api/posts/:id/comments
POST   /api/posts/:id/comments

POST   /api/upload/sign          签发 COS 预签名 URL
                                 入参 { filename, contentType, size }
                                 返回 { uploadUrl, key, expiresAt }
                                 必须校验 size ≤ 5MB、contentType 白名单

GET    /api/forums
GET    /api/forums/:id/threads
GET    /api/plugins?q=&tag=

WS     /ws                       聊天，JWT 鉴权
```

### 4. 前端改造

**只改数据层，不动 UI。**

- 新建 `js/api.js`：统一的 fetch 封装，处理 401、错误提示、加载态
- 改造 `js/app.js`：把读 `data.js` 的地方换成 `await api.xxx()`
- `js/data.js` 保留为**离线演示兜底**：API 不可用时回退到假数据，方便本地开发
- 图片渲染统一走 `img.example.com/{key}?style=thumb`

### 5. 部署配套

- `server/jingyu.service`：systemd 单元文件
- `.env.example`：列出所有环境变量（COS 密钥、JWT secret、端口等）
- 更新 `deploy/README.md`：补充后端部署步骤
- 一个 `deploy/server-setup.sh`：Ubuntu 22.04 上安装 Node 20、创建用户、配置 systemd 的一键脚本

## 六、禁止事项

- ❌ **不要重写前端 UI**，`css/app.css` 和 `js/app.js` 的渲染逻辑保持原样
- ❌ 不要引入 ORM（Prisma / TypeORM / Sequelize 都太重），直接写 SQL
- ❌ 不要引入 Redis，起步阶段用不上
- ❌ 不要写 Docker / docker-compose，轻量服务器直接 systemd
- ❌ 不要把图片存本地磁盘
- ❌ 不要引入前端框架（React/Vue），保持零依赖
- ❌ 不要在代码里硬编码任何密钥，全部走环境变量

## 七、验收标准

- [ ] `npm start` 能起服务，`GET /healthz` 返回 200
- [ ] 注册 → 登录 → 发一条带图动态 → 刷新页面能看到，全链路跑通
- [ ] 上传时观察：图片流量**不经过服务器**（服务器带宽监控几乎不动）
- [ ] 动态流里的图片 URL 带 `?style=thumb`，返回 `content-type: image/webp`
- [ ] 上传 GIF，返回的是 WebP 动图且体积降 80% 以上
- [ ] 未登录访问写接口返回 401
- [ ] 超过 5MB 的文件被 `/api/upload/sign` 拒绝
- [ ] `node deploy/build.mjs` 构建后，`dist/` 里的资源带内容哈希
- [ ] 断网或 API 挂掉时，前端回退到 `data.js` 的演示数据，不白屏

## 八、代码规范

- 注释用**中文**
- 错误信息用中文，直接告诉用户怎么改
- 所有接口返回统一结构：`{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`
- 敏感操作（发帖、评论）要做频率限制，防止刷屏
- 用户输入必须转义，防 XSS

## 九、开始之前

先读这几个文件，理解现有实现再动手：

1. `js/data.js` —— 看清数据结构，API 返回要与之对齐
2. `js/app.js` —— 找到所有读取数据的地方，列出改造清单
3. `deploy/build.mjs` —— 构建逻辑
4. `deploy/README.md` —— 已定的部署方案

**先给我一份改造清单和 schema 设计，确认后再写代码。**
