# 鲸域 · 告警邮件 + COS 图片存储 配置教程（小白版）

> 这份文档只需要你动手 2 次，每次 10 分钟左右。
> 第 1 节配「告警邮件」，第 2 节配「COS 图片存储」。
> 两节互相独立，可以先做第 1 节。

---

## 目录

- [第 0 节 先说结论](#第-0-节-先说结论)
- [第 0.5 节 sudo 是什么](#第-05-节-sudo-是什么)
- [第 1 节 告警邮件（10 分钟）](#第-1-节-告警邮件10-分钟)
- [第 2 节 COS 图片存储（15 分钟）](#第-2-节-cos-图片存储15-分钟)
- [第 3 节 花钱吗](#第-3-节-花钱吗)
- [第 4 节 最后的验收清单](#第-4-节-最后的验收清单)
- [第 5 节 出问题看这里](#第-5-节-出问题看这里)

---

## 第 0 节 先说结论

服务器上已经给你装好了 6 个命令，你不用记任何路径：

| 命令 | 干什么 | 什么时候用 |
| --- | --- | --- |
| `sudo jingyu-setup` | 打开菜单式配置向导（1 告警 / 2 COS / 3 检查现状） | **不知道敲什么就敲这个** |
| `sudo jingyu-status` | 一句话体检全站，列出「好 N 项 / 待办 N 项」 | 想知道服务器现在健不健康 |
| `sudo jingyu-help` | 打印全部命令速查（含 sudo 大白话解释） | 忘了命令 |
| `sudo jingyu-alert-config` | 交互式填 QQ 邮箱授权码 | **配告警时用这个** |
| `sudo jingyu-alert-test` | 立刻发一封测试邮件 | 想验证告警通不通 |
| `sudo jingyu-alert-selftest` | 6 层逐级排查（配置→DNS→端口→TLS→认证→真发信） | **收不到信时先跑这个** |
| `sudo jingyu-cos-config` | 交互式填 COS 密钥 | **配 COS 时用这个** |
| `sudo jingyu-cos-check` | 真传一张图到桶里再删掉，全链路自检 | 配完 COS 后跑 |
| `sudo jingyu-cos-sep bang` | 把图片样式改成 `!thumb`（备用方案） | COS 控制台找不到「自定义分隔符」时 |
| `sudo jingyu-integrity.sh --init` | 你自己改了系统配置后重建基线 | 收到「文件被改」告警且确认是你自己改的 |

这些命令都是**交互式**的：运行后它会一行一行问你，你粘贴、回车就行，不用改任何文本文件、不用懂 vim。

---

## 第 0.5 节 sudo 是什么

**一句话：`sudo` 就是「管理员模式」。**

服务器里有两类人：

| | 能干什么 |
| --- | --- |
| 普通用户（你登录后的身份叫 `ubuntu`） | 只能动自己的文件、看日志，改不了系统配置 |
| 管理员（`root`） | 什么都能干，包括把系统搞坏 |

腾讯云给你的账号是**普通用户**。但改服务器配置（写 `/etc/` 下的文件、重启服务）必须管理员才行。所以有了 `sudo`：

```
sudo systemctl restart jingyu
└┬─┘ └────────┬──────────┘
 │            └── 真正要执行的动作
 └── 「这一条命令，让我以管理员身份跑」
```

三个关键点：

1. **只对紧跟的那一条命令生效**，不是「进了管理员模式」。跑完立刻退回普通身份。
2. **它不会问你密码**。你这台机器已经配了「免密 sudo」（`NOPASSWD`），敲下去直接执行。这是给你省事的，也是当初故意留的。
3. **忘了加 `sudo` 会报 `Permission denied`**。看到这个词，就是少了 `sudo`，把原命令重敲一遍、前面加 `sudo ` 就行。不用改别的东西。

> 顺便说：命令行里 `|` 竖线是管道，`#` 后面是注释不会执行；`$ ` 或 `> ` 是提示符，别抄进去。

---

## 第 0.6 节 怎么连上服务器

三选一，**第一个最省事**：

**方式 A：桌面双击（推荐）**

已经在你的 Windows 桌面放了 **「登录服务器.bat」**，双击它，等两秒就进服务器了。黑窗口里出现 `ubuntu@VM-0-2-ubuntu:~$` 就是连上了。

**方式 B：腾讯云网页登录（最不容易出错）**

1. 打开 <https://console.cloud.tencent.com/lighthouse/instance>
2. 找到实例 `lhins-XXXXXXXX`，点右边的 **登录**
3. 弹出的窗口直接点 **登录**（默认就是 ubuntu 用户），浏览器里就出现一个终端

**方式 C：自己开 PowerShell 敲**

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" ubuntu@SERVER_IP
```

> 为什么不给你密码？因为服务器的密码登录**已经关了**（这是安全加固的一部分）。现在只能用密钥，而密钥就在你自己的电脑上。所以要么在**这台电脑**上连，要么走腾讯云控制台。

---

## 第 0.7 节 进来之后先敲这一条

```bash
sudo jingyu-setup
```

会看到一个菜单：

```
================================================
  鲸域服务器 · 配置向导
================================================

  1) 配置告警邮件          当前：还没配
  2) 配置 COS 图片存储      当前：还没配
  3) 检查现状（不改任何东西）
  4) 看常用命令速查
  0) 退出

  输入数字，回车:
```

**输入 1 回车** → 进告警邮件配置；**输入 2 回车** → 进 COS 配置。每一步它都会告诉你现在该干什么，不用记命令。

想先看看现在什么状态（不会改任何东西）：输入 `3`。

> 想中断就按 `Ctrl + C`，那是「打断」，安全的，不会搞坏东西。

---

## 第 1 节 告警邮件（10 分钟）

### 1.1 为什么需要「授权码」而不是 QQ 密码

QQ 邮箱不允许第三方程序用你的登录密码发信。你要在邮箱里单独生成一个 16 位的「授权码」，专门给程序用。它跟密码是两回事，可以随时作废重发。

### 1.2 拿到授权码（在浏览器里做，共 8 步）

1. 打开 <https://mail.qq.com> 并登录你的 QQ 邮箱（you@example.com）
2. 点页面顶部的 **设置**（齿轮图标）→ **账号与安全**
3. 往下滚，找到 **安全设置** 区域
4. 找到 **生成授权码** 按钮，点它
5. 如果提示需要验证，按它说的做（发短信 / 扫脸，随便哪个都行）
6. 屏幕上会出现一个 **16 位英文字母** 的串，比如 `abcdwxyzefghijkl`
   —— **这就是授权码，只显示这一次，先复制到记事本**
7. 回到 **安全设置**，确认 **POP3/SMTP 服务** 或 **IMAP/SMTP 服务** 处于 **已开启** 状态
   （如果是「未开启」，点开启，它会再让你验一次身份）
8. 搞定，回到服务器

> 注意：授权码是 16 位**纯英文字母**。如果你看到的是一串带数字的，那不是授权码，是别的东西，往回找。

### 1.3 填进服务器（2 条命令）

先连上服务器（看[第 0.6 节](#第-06-节-怎么连上服务器)），然后：

```bash
sudo jingyu-setup
```

菜单里输 `1` 回车。它内部就是调用 `jingyu-alert-config`，你也可以直接敲：

```bash
sudo jingyu-alert-config
```

它会依次问你三个问题：

```
收件邮箱 [you@example.com]:        ← 直接回车（就用默认的）
发件 QQ 邮箱 [you@example.com]:    ← 直接回车
现在粘贴 16 位授权码（输入时屏幕不显示，粘完回车）
  授权码:                            ← 粘贴，回车（屏幕不显示是正常的，安全考虑）
```

粘贴完回车后，它会：

1. 检查长度是不是 16 位、是不是纯字母（不对就直接中止，什么都不改）
2. 备份旧配置到 `/root/jingyu-alert-bak/`
3. 写进 `/etc/jingyu-alert.conf` 并设成 600（只有 root 能读）
4. **当场真发一封邮件**

看到这个就成功了：

```
================================================
  发送成功！去 you@example.com 收信（可能在垃圾箱里）
================================================
```

去邮箱看看，主题是 **【鲸域告警】配置测试：告警邮件打通了**。

> 没收到？先翻垃圾箱 / 广告邮件。还找不到就跑一次分层自检，它会直接告诉你卡在哪一层：

```bash
sudo jingyu-alert-selftest
```

它会逐层打印，每层要么 `[ OK ]` 要么 `[FAIL]`，最后给「通过 X 项，未通过 Y 项」：

```
--- 1. 配置文件 ---
  [ OK ] /etc/jingyu-alert.conf 存在
  [ OK ] 权限 600
  [ OK ] ALERT_ENABLED=1
  [ OK ] ALERT_TO=you@example.com
  [ OK ] SMTP_USER=you@example.com
  [ OK ] SMTP_PASS 已填（16 位，不回显）
  [info] SMTP_HOST=smtp.qq.com PORT=465 MODE=ssl

--- 2. DNS 解析 ---
  [ OK ] smtp.qq.com -> 2402:4e00:1020:...

--- 3. TCP 端口 ---
  [ OK ] smtp.qq.com:465 可连
  [ OK ] smtp.qq.com:587 可连

--- 4. TLS 握手 / 5. 认证 / 6. 真发一封 ---
  [ OK ] TLS 握手成功（SSL 465）
  [ OK ] 认证通过（授权码正确）
  [jingyu-alert] 已发送：【鲸域告警】分层自检：全部通过 -> you@example.com
  [ OK ] 真发信成功

======================================
  通过 12 项，未通过 0 项
======================================
```

哪一层 `[FAIL]` 就是病根，对照[第 5 节](#第-5-节-出问题看这里)处理。

### 1.4 以后什么情况会收到邮件

| 触发条件 | 邮件主题 | 频率限制 |
| --- | --- | --- |
| 69 个关键系统文件被改动（`/etc/passwd`、sshd 配置、sudoers、authorized_keys 等） | 关键文件被修改（完整性校验失败） | 1 小时最多 1 封 |
| 完整性基线文件被人删了 | 完整性基线丢失，校验已停摆 | 1 小时最多 1 封 |
| 数据库体检不通过（损坏 / 外键错 / 触发器缺失 / 权限不对 / 备份超 26 小时） | 每日巡检发现异常 | 1 天最多 1 封 |
| 单个 IP 24 小时内失败登录超过 500 次 | 每日巡检发现异常 | 1 天最多 1 封 |

邮件正文里会直接告诉你**该怎么办**，包括要执行的命令。

> 为什么要限制频率：互联网上每天都有扫描器打你的服务器，如果每被扫一次就发一封，你的邮箱会被轰爆。所以同一类告警 1 小时内只发一封，其余记录在日志里。

### 1.5 两个常用的收尾动作

**A. 如果告警说「文件被改」，但你确认那是你自己改的**

说明基线过期了。重建一次基线，之后就不再报这个：

```bash
sudo /usr/local/sbin/jingyu-integrity.sh --init
```

**B. 想临时关掉告警邮件**

```bash
sudo sed -i 's/^ALERT_ENABLED=1/ALERT_ENABLED=0/' /etc/jingyu-alert.conf
```

重新打开就把 0 改回 1。改完立刻生效，不用重启任何服务。

---

## 第 2 节 COS 图片存储（15 分钟）

### 2.1 先说人话：COS 是什么，为什么必须用

**COS = 腾讯云的对象存储**，可以理解成一个「放在云上的超大网盘」，专门存文件。

为什么网站必须用它，而不是把图存在服务器上：

| | 图存服务器（现在） | 图存 COS（配完之后） |
| --- | --- | --- |
| 用户传一张 3MB 的图 | 3MB 流量走**你的服务器** | 3MB 直接走 COS，**服务器一点不沾** |
| 你的流量包 | 5Mbps 带宽 / 500GB 月，图片一多就爆 | 图片完全不吃服务器带宽 |
| 缩略图 | 做不了，只能原图硬塞 | 自动生成 750px WebP，流量降 80%+ |
| 备份 | 要跟着服务器一起备份 | COS 自己三副本 |

服务器的带宽是 **5Mbps**（约 600KB/s）。一张 3MB 的原图传一次要 5 秒，10 个人同时看就卡死了。所以这不是"优化"，是**必须**。

### 2.2 开通 COS（控制台点哪里）

1. 打开 <https://console.cloud.tencent.com/cos>
2. 第一次进会让你 **开通服务**，点「同意并开通」（免费的，不开通没法建桶）
3. 如果提示要 **实名认证**，按它说的做（你买服务器时应该已经认证过了）

### 2.3 创建存储桶（这一步选错后面全乱）

在 COS 控制台左侧点 **存储桶列表** → 右上角 **创建存储桶**。

**逐个填：**

| 选项 | 填什么 | 为什么 |
| --- | --- | --- |
| 名称 | `jingyu` | 最终桶名会自动变成 `your-bucket-APPID`（后面那串数字是你的 APPID，腾讯云自动加，你改不了也不用管） |
| 所属地域 | **广州**（ap-guangzhou） | 你的服务器在上海，但广州和你现有配置一致。**记住你选了哪个**，后面要填 |
| 访问权限 | **公有读私有写** | 关键！公有读=任何人能通过 URL 看图（正常）；私有写=只有你的密钥能传（防别人往你桶里塞东西） |
| 版本控制 | 关闭 | 没必要 |
| 服务端加密 | 关闭 | 没必要 |
| 日志存储 | 关闭 | 没必要 |

点 **创建**。

创建完后，在桶列表里能看到 **桶名**（形如 `your-bucket-APPID`）和 **地域**（形如 `ap-guangzhou`）。**这两个先记下来**。

### 2.4 拿密钥（SecretId / SecretKey）

⚠️ **注意：密钥是整个腾讯云账号的最高权限，泄露等于账号被接管。** 所以下面我按最保守的方式教你。

打开 <https://console.cloud.tencent.com/cam/capi>：

- **SecretId**：`AKID` 开头的一长串
- **SecretKey**：32 位左右的随机串（点「显示」才看得到）

**先别急着复制主账号密钥。** 建议这样做（多花 2 分钟，安全性差一个数量级）：

1. 打开 <https://console.cloud.tencent.com/cam> → **用户** → **新建用户** → **自定义创建**
2. 用户类型选 **可访问的资源**，用户名填 `cos-upload`
3. 访问方式只勾 **编程访问**（会生成 SecretId/SecretKey）
4. 下一步，权限策略搜索 `QcloudCOSDataFullControl` 勾上 → 完成
5. 在这个新用户的详情页里，复制它的 **SecretId** 和 **SecretKey**

这样万一密钥泄露，别人只能操作你的 COS，动不了服务器和账单。

> 想在服务器上不存任何密钥？可以，但要走「服务器临时密钥 STS」，配置复杂得多。现在这个阶段用子账号密钥足够了。

### 2.5 配置跨域 CORS（**不做这一步，上传 100% 失败**）

为什么必须配：你的网站是 `http://SERVER_IP`，要往 `https://your-bucket-APPID.cos.ap-guangzhou.myqcloud.com` 传文件，这是**跨域**。浏览器在跨域 PUT 之前会先发一个 OPTIONS 预检，桶不允许就直接拒了。

1. 打开 COS 控制台 → 点进你刚建的桶
2. 左侧菜单找 **安全管理** → **跨域访问 CORS 设置**（有的版本在 **基础配置** 里）
3. 点 **添加规则**，填：

| 字段 | 填什么 |
| --- | --- |
| 来源 Origin | `http://SERVER_IP` |
| 操作 Methods | 勾选 **PUT**、**GET**、**HEAD** |
| Allow-Headers | `*` |
| Expose-Headers | `ETag`、`Content-Length` |
| 超时 Max-Age | `600` |

4. 保存

> 以后绑了域名（比如 `https://www.example.com`），要回来再加一条 Origin。也可以先填 `*` 图省事，但正式上线建议写具体域名。

### 2.6 让 `?style=thumb` 生效（缩略图的关键）

网站的代码里，图片 URL 一律带 `?style=thumb`（缩略图）或 `?style=thumb-sm`（小图）。要让 COS 认这个参数，需要两步：

**第一步：开启图片处理**

1. COS 控制台 → 点进桶 → 左侧 **数据处理** → **图片处理**
2. 如果提示需要开通 **数据万象（CI）**，点开通（有免费额度）
3. 找到 **自定义分隔符** 设置，**把它改成 `?style=`**

   - 默认分隔符是 `!`，也就是 URL 长这样：`xxx.jpg!thumb`
   - 改成 `?style=` 之后，URL 就变成 `xxx.jpg?style=thumb`，和网站代码对上了

   > 找不到「分隔符」？不同版本的入口位置不一样，可能在 **图片处理 → 样式管理 → 设置** 里。如果实在找不到，去[第 5 节](#第-5-节-出问题看这里)看备选方案。

**第二步：建两个样式**

在 **图片处理 → 样式管理 → 添加样式** 里，建两个：

| 样式名 | 处理参数 | 用途 |
| --- | --- | --- |
| `thumb` | `imageMogr2/thumbnail/750x/format/webp/quality/85` | 动态流里的大图 |
| `thumb-sm` | `imageMogr2/thumbnail/320x/format/webp/quality/80` | 列表里的小图 |

样式名必须**一字不差**是 `thumb` 和 `thumb-sm`（大小写、横线都要对）。

### 2.7 CDN 加速（可选，先跳过也行）

不配 CDN 也能用，图片地址会是 `https://your-bucket-APPID.cos.ap-guangzhou.myqcloud.com/u/10/2026/10/abc.jpg?style=thumb`，能正常显示，只是国内访问稍慢。

想加速的话：

1. 打开 <https://console.cloud.tencent.com/cdn> → **域名管理** → **添加域名**
2. 加速域名：比如 `img.你的域名.com`（**必须是你自己的已备案域名**，没有域名就先跳过）
3. 源站类型选 **COS 源**，选你刚建的桶
4. 回源 Host 保持默认
5. 配完去域名服务商那里，按 CDN 给的 CNAME 值加一条解析
6. 等 10 分钟左右生效，然后把这个域名填进第 2.8 步的「CDN 域名」问题里

**没有备案域名？那就跳过这步**，用 COS 默认域名完全能用。

### 2.8 填进服务器（1 条命令）

SSH 登进服务器：

```bash
sudo jingyu-cos-config
```

依次回答：

```
【必填 1/3】SecretId:         ← 粘贴 AKID 开头那串
【必填 2/3】SecretKey:        ← 粘贴（不显示）
【必填 3/3】存储桶:            ← 粘贴 your-bucket-APPID
【可选 4/5】地域 [ap-guangzhou]: ← 如果你建桶时选了广州，直接回车
【可选 5/5】CDN 域名（留空跳过）: ← 没域名就回车
```

它会：

1. 校验 SecretId 是不是 AKID 开头、SecretKey 长度够不够（不对就中止，什么都不改）
2. 备份 `.env` 到 `/root/jingyu-env-bak/`
3. 写进配置，重启后端
4. 如果后端起不来，**自动回滚并重启**，告诉你去看日志
5. 后端起来了，自动跑自检

### 2.9 自检（会自动跑，也可以手动再跑）

```bash
sudo jingyu-cos-check
```

它会做 6 件事：

1. 检查 5 个配置字段格式对不对
2. 检查 COS SDK 装没装
3. **真往桶里传一张 1×1 的小 PNG**
4. **读回来比对字节是不是完全一致**
5. 用浏览器的方式访问一次，看能不能打开、`?style=thumb` 有没有生效
6. **删掉刚才那个测试文件**

全部通过的输出长这样：

```
===== 鲸域 COS 配置自检 =====
--- 1. 配置字段 ---
  [ OK ] COS_SECRET_ID = AKIDabcd****wxyz
  [info] COS_SECRET_KEY 已填（长度 32，不回显）
  [ OK ] COS_BUCKET = your-bucket-APPID
  [ OK ] COS_REGION = ap-guangzhou
--- 2. COS SDK ---
  [ OK ] cos-nodejs-sdk-v5 已安装且能加载
--- 3. 真实上传测试（1x1 PNG，用完即删）---
  [ OK ] 上传成功（密钥、桶名、地域、写权限全部通过）
--- 4. 回读比对 ---
  [ OK ] 读回来的字节和上传的完全一致
--- 5. 图片能不能直接在浏览器打开 ---
  [ OK ] COS 默认域名可访问 200（25 字节）
--- 5.5 缩略图样式 ?style=thumb 是否生效 ---
  [ OK ] 样式生效：返回 image/webp
--- 6. 清理测试文件 ---
  [ OK ] 测试对象已删除

===== 全部通过，图片直传已可用 =====
```

### 2.10 最后一步：在网站上真的传一张图

1. 打开 <http://SERVER_IP/>
2. 登录，发一条带图片的动态
3. 图发出来之后，**右键点图片 → 复制图片地址**
4. 地址应该是这样的：

```
https://your-bucket-APPID.cos.ap-guangzhou.myqcloud.com/u/10/2026/10/abc123...jpg?style=thumb
```

**看到有两个特征就说明成功：**
- 域名是 `cos.ap-guangzhou.myqcloud.com`（或你的 CDN 域名），**不是** `SERVER_IP`
- 结尾带 `?style=thumb`

---

## 第 3 节 花钱吗

| 项目 | 费用 |
| --- | --- |
| 告警邮件 | **0 元**（用你自己的 QQ 邮箱发，不花服务器钱） |
| COS 存储 | 新用户有免费额度（50GB / 6 个月，以控制台实际提示为准）。你这种量级，过了免费期大概**几毛钱一个月** |
| COS 请求 | 上传一次算一次请求，10000 次请求约 0.01 元 |
| 图片处理 | 数据万象有免费额度（每月若干千次），超出按次计费，同样几分钱量级 |
| CDN（可选） | 按流量计费，约 0.2 元/GB。**不配就没有这项费用** |

**总之一句话：正常发帖看图，一个月不会超过 5 块钱。** 真正贵的是不配 COS —— 图片吃光服务器 500GB 流量包之后，超额流量按 GB 收费、而且网站会卡到打不开。

---

## 第 4 节 最后的验收清单

打勾就行：

### 告警

- [ ] `sudo jingyu-alert-config` 跑完显示「发送成功」
- [ ] 邮箱收到了主题为 **【鲸域告警】配置测试：告警邮件打通了** 的邮件
- [ ] `sudo ls -l /etc/jingyu-alert.conf` 显示 `-rw-------  root root`
- [ ] `sudo jingyu-integrity.sh` 输出「完整性校验通过：无变更（69 个文件）」

### COS

- [ ] 桶建好了，权限是「公有读私有写」
- [ ] CORS 里加了 `PUT` / `GET` / `HEAD`
- [ ] 图片处理分隔符改成了 `?style=`
- [ ] 样式 `thumb` 和 `thumb-sm` 都建好了
- [ ] `sudo jingyu-cos-check` 全绿
- [ ] 网站上发的图，地址是 cos 域名 + `?style=thumb`

---

## 第 5 节 出问题看这里

### 告警邮件相关

| 现象 | 原因 | 怎么办 |
| --- | --- | --- |
| 提示「授权码应该是 16 位，你输入的是 N 位」 | 复制少了 / 复制到别的东西 | 回邮箱重新生成一个 |
| 提示「SMTP 认证失败」 | 授权码错了，或 SMTP 服务没开 | ① 邮箱设置里确认 SMTP 服务已开启 ② 重新生成授权码再填一次 |
| 提示「SMTP 连接被服务端断开（Connection unexpectedly closed）」 | **QQ 邮箱对连续错登录会直接断连**，不返回 535 错误码 | ① 等 15 分钟再试 ② 确认授权码是刚生成的那一个 ③ 跑 `sudo jingyu-alert-selftest` 看 TCP/TLS 层是否正常 |
| 提示「连不上 SMTP 服务器」/「SMTP 超时」 | 出网被拦或 DNS 有问题 | 跑 `sudo jingyu-alert-selftest`，看第 2、3 层哪一层 FAIL |
| 提示「TLS 握手失败」 | 系统时间偏了导致证书校验失败 | `sudo chronyc makestep` 后重试 |
| 不知道卡在哪一层 | — | `sudo jingyu-alert-selftest`，它会一层一层打印 PASS/FAIL，哪层红就是病根 |
| 显示发送成功但邮箱没收到 | 进了垃圾箱 | 翻垃圾箱/广告邮件；把发件人加白名单 |
| 想验证告警是不是真能触发 | — | 用测试邮件：`sudo jingyu-alert-test` |
| 一直没收到任何「文件被改」告警 | 可能确实没人改 | 这是好事。想确认监控活着：`sudo /usr/local/sbin/jingyu-integrity.sh; echo rc=$?` 应该输出「无变更」rc=0 |

### COS 相关

| 自检报的错 | 真实原因 | 怎么办 |
| --- | --- | --- |
| `COS_SECRET_ID 不以 AKID 开头` | 填成了 APPID 或别的数字 | 去 <https://console.cloud.tencent.com/cam/capi> 重新复制 |
| `[SecretId] ...` 类报错 | SecretId 不存在 / 已被禁用 | 控制台确认这个密钥的状态是「已启用」 |
| `SignatureDoesNotMatch` | SecretKey 复制漏了字符 | 删掉这个密钥，重新生成一个再填 |
| `NoSuchBucket` | 桶名少了 `-数字后缀`，或地域填错 | 桶名要完整复制（含 `-1300000000`）；地域要和控制台一致 |
| `AccessDenied` | 密钥权限不够 | 给这个用户加 `QcloudCOSDataFullControl` 策略 |
| `RequestTimeTooSkewed` | 服务器时间偏了 | `sudo chronyc makestep` |
| `ETIMEDOUT` / 连不上 | 出网问题 | `curl -I https://cos.ap-guangzhou.myqcloud.com` 看通不通 |
| 自检全绿，但**网站上传失败** | **CORS 没配**（最常见） | 回到 [2.5](#25-配置跨域-cors不做这一步上传-100-失败)，确认 Origin 写的是 `http://SERVER_IP`（协议、IP 都要对，末尾不要带 `/`） |
| 自检全绿，图能传上去，但**显示是原图不是缩略图** | 样式分隔符还是默认的 `!` | 回 [2.6](#26-让-stylethumb-生效缩略图的关键) 把分隔符改成 `?style=` |
| 报「样式没生效：服务端原样吐回了原图」 | 同上，或者根本没开图片处理 | 先确认数据万象已开通，再确认样式名是 `thumb` |

### 备选方案：找不到「自定义分隔符」设置

某些控制台版本（尤其是没开通数据万象时）确实没有「自定义分隔符」这个选项。这时不要硬找，直接让网站改用 COS 默认的 `!` 分隔符，一条命令搞定：

```bash
sudo jingyu-cos-sep bang
```

它会：

1. 自动备份 `upload.js` 到 `/root/jingyu-env-bak/`
2. 把代码里的 `?style=${s}` 改成 `!${s}`
3. 重启后端，起不来会自动回滚
4. 打印当前模式确认

之后图片地址会变成 `xxx.jpg!thumb`，再去 COS 控制台建名为 `thumb` / `thumb-sm` 的样式即可（样式名不用变）。

**想改回去**：

```bash
sudo jingyu-cos-sep query     # 改回 xxx.jpg?style=thumb
sudo jingyu-cos-sep show      # 只看当前是哪种，不改动
```

**改完一定要重建基线**，否则下次巡检会报「文件被改」（因为它监控着 upload.js）：

```bash
sudo /usr/local/sbin/jingyu-integrity.sh --init
```

---

## 附：全部相关命令速查

```bash
# ===== 万能入口 =====
sudo jingyu-setup                 # 菜单式配置向导（不知道敲什么就敲这个）
sudo jingyu-status                # 一句话体检全站（好 N 项 / 待办 N 项）
sudo jingyu-help                  # 全部命令速查 + sudo 大白话解释

# ===== 告警 =====
sudo jingyu-alert-config          # 交互式配置（填授权码）
sudo jingyu-alert-test            # 立刻发一封测试邮件
sudo jingyu-alert-selftest        # 6 层逐级排查（收不到信时先跑）
sudo cat /etc/jingyu-alert.conf   # 看当前配置（含授权码，别外传）

# ===== COS =====
sudo jingyu-cos-config            # 交互式配置（填密钥）
sudo jingyu-cos-check             # 全链路自检
sudo grep '^COS_' /var/www/jingyu/server/.env   # 看当前填了什么
sudo jingyu-cos-sep show          # 看图片样式用的哪种分隔符
sudo jingyu-cos-sep bang          # 改成 !thumb（控制台不能自定义分隔符时）
sudo jingyu-cos-sep query         # 改回 ?style=thumb

# ===== 巡检 =====
sudo /usr/local/sbin/jingyu-integrity.sh          # 手动跑完整性校验
sudo /usr/local/sbin/jingyu-integrity.sh --init   # 重建基线
sudo /usr/local/sbin/jingyu-db-check.js           # 手动跑数据库体检
sudo systemctl start jingyu-security-check        # 手动跑一次每日巡检
sudo cat /var/log/jingyu-security-$(date +%F).log # 看今天的巡检报告

# ===== 出问题看日志 =====
sudo journalctl -u jingyu -n 50 --no-pager        # 后端日志
sudo tail -50 /var/log/nginx/error.log            # nginx 错误
sudo journalctl -t jingyu-alert -n 20 --no-pager  # 告警发信日志
```