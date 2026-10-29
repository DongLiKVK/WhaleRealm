/* ==========================================================================
   界面语言层（zh / en）
   --------------------------------------------------------------------------
   只翻译「界面 chrome」：导航、按钮、表单标签、空态、提示。
   用户生成内容（帖子正文、评论、昵称、插件简介等）保持原文，不在这里改。
   用法：
     I18N.lang()            -> 'zh' | 'en'
     I18N.t('中文', 'English') -> 按当前语言取一个
     I18N.set('en')         -> 切换并落 localStorage
     I18N.apply(root)       -> 翻译 root 下的界面文本与 placeholder/title/aria-label
   设计：精确文本字典 + 少量数字模式；不碰 textarea / contenteditable / 用户内容容器。
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'dsh-forum-lang';
  var lang = 'zh';
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'zh') lang = saved;
  } catch (e) {}

  var DICT = {
    /* ---------- 顶栏 / 导航 / 页脚 ---------- */
    "首页": "Home",
    "鲸鲸空间": "Art",
    "鲸鲸": "Art",
    "插件库": "Plugins",
    "社群": "Community",
    "AI排行": "Rank",
    "AI 排行": "AI Ranking",
    "赞助": "Support",
    "我的空间": "My Space",
    "主导航": "Main navigation",
    "移动端导航": "Mobile navigation",
    "搜插件 / 帖子 / 用户": "Search plugins / posts",
    "搜索插件、帖子或用户": "Search plugins, posts or users",
    "切换白天 / 夜间": "Toggle light / dark",
    "切换白天 / 夜间模式": "Toggle light / dark mode",
    "消息": "Inbox",
    "消息中心": "Message center",
    "我的账号菜单": "Account menu",
    "离线 · 请登录": "Offline · Sign in",
    "离线状态，点这里登录": "Offline. Click to sign in",
    "深水里，聊点真的": "Real talk from the deep",
    "把插件写成作品": "Plugins as craft",
    "一条有烟火气的巷子": "A street with some life",
    "来坐坐再走": "Stay a while",
    "广场上见": "See you on the square",
    "在这儿靠岸": "Drop anchor here",
    "把插件连成星图": "A constellation of plugins",
    "当前离线，点这里登录": "Currently offline. Click to sign in",
    "我的资料": "My profile",
    "我的收藏": "My favorites",
    "我的私信": "Direct messages",
    "我的赞助": "My support",
    "退出登录": "Sign out",
    "设置": "Settings",
    "登录": "Sign in",
    "注册": "Sign up",
    "关于社群": "About",
    "插件规范": "Plugin guidelines",
    "赞助鲸域": "Support WhaleRealm",
    "转载与下架政策": "Repost & takedown policy",
    "反馈与建议": "Feedback",
    "演示站点，数据均为虚构": "Demo site. All data is fictional.",
    "首页 / 鲸鲸 / 插件库 / 社群 / 我的空间": "Home / Whale Art / Plugins / Community / My Space",

    /* ---------- 通用 ---------- */
    "全部": "All",
    "最新": "Newest",
    "热门": "Trending",
    "推荐": "Recommended",
    "关注": "Following",
    "粉丝": "Followers",
    "访客": "Visitors",
    "作品": "Works",
    "日志": "Posts",
    "插件": "Plugins",
    "相册": "Albums",
    "留言": "Guestbook",
    "问答": "Q&A",
    "公告": "Notices",
    "人工智能": "AI",
    "科技快讯": "Tech news",
    "灌水闲聊": "Off-topic",
    "国产软件": "CN software",
    "经验分享": "Experience",
    "技术开发": "Development",
    "资源分享": "Resources",
    "网盘资源": "Cloud drives",
    "优惠福利": "Deals",
    "网络考古": "Net history",
    "工具部署": "Tooling & ops",
    "站务反馈": "Site feedback",
    "搜索": "Search",
    "筛选": "Filter",
    "取消": "Cancel",
    "确认": "Confirm",
    "保存": "Save",
    "保存修改": "Save changes",
    "保存成功": "Saved",
    "提交": "Submit",
    "删除": "Delete",
    "编辑": "Edit",
    "关闭": "Close",
    "返回": "Back",
    "返回首页": "Back to home",
    "上一页": "Previous",
    "下一页": "Next",
    "加载中…": "Loading…",
    "加载更多": "Load more",
    "没有更多了": "No more",
    "网络错误": "Network error",
    "网络异常": "Network error",
    "重试": "Retry",
    "刚刚": "Just now",
    "昨天": "Yesterday",
    "今天": "Today",
    "已读": "Read",
    "未读": "Unread",
    "在线": "Online",
    "离线": "Offline",
    "当前": "Current",
    "手机": "Phone",
    "电脑": "Computer",
    "未知": "Unknown",
    "未知作者": "Unknown author",
    "未知系统": "Unknown OS",
    "浏览器": "Browser",
    "我": "Me",
    "你": "You",
    "作者": "Author",
    "插件作者": "Plugin author",
    "版主": "Moderator",
    "内测组": "Beta group",
    "发布": "Publish",
    "发布者": "Publisher",
    "原作": "Original work",
    "授权": "License",
    "转载": "Repost",
    "原创": "Original",
    "评论": "Comments",
    "回复": "Reply",
    "点赞": "Like",
    "收藏": "Favorite",
    "分享": "Share",
    "举报": "Report",
    "复制链接": "Copy link",
    "已点赞": "Liked",
    "已取消赞": "Like removed",
    "已收藏": "Favorited",
    "已取消收藏": "Removed from favorites",
    "展开": "Expand",
    "收起": "Collapse",
    "更多": "More",
    "查看": "View",
    "查看全部": "View all",
    "查看条目 ›": "View entry ›",
    "查看插件 ›": "View plugin ›",
    "置顶": "Pinned",
    "外链": "External",
    "去登录": "Sign in",
    "去发布": "Publish",
    "去逛逛": "Browse",
    "换一个": "Try another",
    "换一张": "Try another",
    "上传": "Upload",
    "下载": "Download",
    "安装": "Install",
    "已安装": "Installed",
    "体积": "Size",
    "版本": "Version",
    "更新": "Update",
    "更新时间": "Updated",
    "分类": "Category",
    "标签": "Tags",
    "简介": "Summary",
    "名称": "Name",
    "邮箱": "Email",
    "密码": "Password",
    "昵称": "Nickname",
    "手机号": "Phone number",
    "验证码": "Verification code",
    "获取验证码": "Get code",
    "确认密码": "Confirm password",
    "城市": "City",
    "签名": "Bio",
    "头像": "Avatar",
    "封面": "Cover",
    "等级": "Level",
    "积分": "Points",
    "会员天数": "Membership days",
    "奖励": "Reward",
    "发放": "Grant",
    "撤回": "Revoke",
    "原因": "Reason",
    "备注": "Note",
    "操作": "Action",
    "状态": "Status",
    "时间": "Time",
    "类型": "Type",
    "结果": "Result",
    "成功": "Success",
    "失败": "Failed",
    "正常": "Active",
    "已禁用": "Disabled",
    "启用": "Enable",
    "禁用": "Disable",
    "全部标签": "All tags",
    "展开全部分类": "Expand all categories",
    "收起分类": "Collapse categories",
    "社群版块": "Community sections",
    "社群分类": "Community categories",
    "消息分类": "Message categories",
    "消息设置": "Message settings",
    "通知偏好": "Notification preferences",
    "全部已读": "Mark all read",
    "本类已读": "Mark these read",
    "标为已读": "Mark read",
    "发起新私信": "New message",
    "发送": "Send",
    "输入消息…": "Type a message…",
    "说点什么…": "Say something…",
    "写评论…": "Write a comment…",
    "收起评论": "Collapse comments",
    "写点什么…": "Write something…",
    "搜索用户": "Search users",
    "搜索插件名 / 标签": "Search plugin name / tag",
    "搜索插件名或标签": "Search plugin name or tag",
    "搜作品、原作者、发布者": "Search works, artists or publishers",
    "搜索正文、作者或 ID": "Search text, author or ID",
    "搜索昵称、邮箱或 ID": "Search nickname, email or ID",
    "搜索账号或名称": "Search account or name",
    "搜索摘要或操作人": "Search summary or operator",
    "搜索用户、原因或记录 ID": "Search user, reason or record ID",
    "搜用户或原因": "Search user or reason",
    "搜索帖子": "Search posts",
    "搜索": "Search",

    /* ---------- 首页 ---------- */
    "更新日志": "Updates",
    "去社群看看 ›": "Go to community ›",
    "这里还没有更新日志": "No updates yet",
    "今天还没有新动态": "No updates yet",
    "最近访客": "Recent visitors",
    "热门话题": "Trending topics",
    "插件推荐": "Recommended plugins",
    "社群公告": "Community announcements",
    "主推版本": "Featured version",
    "最近更新": "Recently updated",
    "查看全部条目 ›": "View all entries ›",
    "我的插件": "My plugins",
    "你还没有发布过插件": "You have not published any plugins yet",
    "去发布一个": "Publish one",
    "逛逛条目库 ›": "Browse the library ›",
    "市场 ›": "Market ›",
    "更多 ›": "More ›",
    "先逛逛 ›": "Browse first ›",
    "请登录": "Sign in",
    "免费注册": "Sign up free",
    "离线状态": "Offline",
    "未登录": "Not signed in",
    "登录后才能发日志、评论、发布插件，也会有自己的空间与消息。": "Sign in to post, comment, publish plugins, and get your own space and messages.",
    "没有账号？": "No account?",
    "更新日志": "Updates",
    "写日志": "Write a post",
    "登录后发表": "Sign in to post",
    "登录后就能发日志：写下这次更新了什么……": "Sign in to post: share what changed…",
    "写下这次更新了什么：版本、改动、踩到的坑……（可以直接粘贴或拖入图片）": "Share what changed: version, changes, pitfalls… (paste or drop images)",
    "图片": "Image",
    "关联插件": "Link plugin",
    "话题": "Topic",
    "附件": "Attachment",
    "发布日志": "Publish post",
    "全部日志": "All posts",
    "我关注的": "Following",
    "插件更新": "Plugin updates",
    "求助问答": "Help & Q&A",
    "按时间": "By time",
    "按热度": "By popularity",
    "去社群看看": "Go to community",
    "还没有发过日志": "No posts yet",
    "还没有发布插件": "No plugins yet",
    "这个页面没能画出来": "This page could not be rendered",
    "页面渲染失败": "Page render failed",
    "返回上一页": "Go back",

    /* ---------- 登录 / 注册 ---------- */
    "已经登录了": "Already signed in",
    "当前账号": "Current account",
    "同一时间只能登录一个账户。": "Only one account can be signed in at a time.",
    "要换号请先退出，退出后才能用另一个邮箱登录；后端只按「设备」记会话（手机一条、电脑一条），换账号仍然得先退出。": "Sign out first to switch accounts. Sessions are tracked per device (one phone, one computer); switching accounts always requires signing out.",
    "密码登录": "Password",
    "注册账号": "Create account",
    "还没有账号？先注册一个 —— 未注册的邮箱登不进来。": "No account yet? Create one — unregistered emails cannot sign in.",
    "注册即登录 —— 只用邮箱 + 密码，不绑手机号。": "Signing up signs you in — email and password only, no phone number.",
    "站点里显示的名字，最多 16 字": "Display name, up to 16 characters",
    "至少 8 位": "At least 8 characters",
    "再输一次": "Enter it again",
    "注册并登录": "Sign up & sign in",
    "其他方式登录": "Other sign-in options",
    "继续即表示同意《社区准则》与《隐私说明》。账号只有邮箱与 GitHub 两种登录方式，不需要手机号。": "By continuing you agree to the Community Guidelines and Privacy Notice. Email and GitHub are the only sign-in methods; no phone number is required.",
    "回到鲸域": "Back to WhaleRealm",
    "插件、日志与社群都在这里等你。一个账号，手机和电脑各一条会话。": "Plugins, posts and community are waiting. One account, one session per device.",
    "第三方授权": "Third-party authorization",
    "授权并登录": "Authorize & sign in",
    "演示态：不走真实 OAuth，直接走同一条状态机。": "Demo mode: no real OAuth, same state machine.",
    "鲸域 请求获取你的 ": "WhaleRealm requests your ",
    "昵称与头像": "nickname and avatar",
    "仅用于创建站内账号，不会读取好友列表或发布内容。": "Only used to create your account; no friend list access or posting.",
    "使用 ": "Sign in with ",
    "手机号认证": "Phone verification",
    "最后一步：认证手机号": "Last step: verify your phone",
    "短信通道还没接通，可以先跳过 —— 不影响进站。": "SMS is not connected yet. You can skip this and still enter the site.",
    "认证手机号能找回账号；": "A verified phone helps recover your account; ",
    "也可以先跳过": "you can also skip it",
    "11 位大陆手机号": "11-digit mainland phone number",
    "6 位数字": "6 digits",
    "完成认证": "Verify",
    "跳过认证，先进站": "Skip and enter",
    "换个账号登录": "Sign in with another account",
    "短信通道还没接通": "SMS is not connected yet",
    "这条验证码不会真的发到手机上。可以先跳过认证，进站正常用；随时回「设置 → 账号与安全」补认证。": "This code will not reach your phone. Skip verification to enter; you can verify later in Settings → Account & security.",
    "演示验证码": "Demo code",
    "真实环境由短信服务商下发，这一行不会出现。": "In production this is sent by the SMS provider; this line will not appear.",

    /* ---------- 设置 ---------- */
    "账号与安全": "Account & security",
    "外观": "Appearance",
    "通知": "Notifications",
    "关于": "About",
    "登录方式": "Sign-in method",
    "登录设备": "Devices",
    "多端同时在线": "Multiple devices",
    "同一账号可以让「电脑 + 手机」各留一条会话，彼此不顶；同一台设备再登一次，只顶掉它自己那一条。": "One session per device; signing in again on the same device replaces only that session.",
    "退出其他设备": "Sign out other devices",
    "主题": "Theme",
    "☀️ 白天": "☀️ Light",
    "🌙 夜间": "🌙 Dark",
    "动效": "Motion",
    "遵循系统的「减少动态效果」设置：开启后入场与滚动都直接跳转。": "Respects the system reduce-motion setting; entrances and scrolling jump directly.",
    "未读消息": "Unread messages",
    "消息提醒": "Message alerts",
    "没有未读消息": "No unread messages",
    "已全部已读，红点已消失": "All read; the dot is gone",
    "顶栏铃铛上还有未读": "Unread items remain in the bell",
    "站点": "Site",
    "数据": "Data",
    "规则": "Rules",
    "没读到设备列表：": "Could not load devices: ",
    "正在读取…": "Loading…",
    "这台设备是唯一在线的会话": "This is the only active session",
    "退出": "Sign out",
    "手机": "Phone",
    "电脑": "Computer",
    "当前": "Current",
    "在线": "Online",
    "通知偏好 ›": "Notification preferences ›",

    /* ---------- 消息 ---------- */
    "登录后这里会显示回复、点赞、私信与通知": "Sign in to see replies, likes, messages and notifications here",
    "私信": "Messages",
    "回私信": "Reply",
    "这一栏还没有消息": "No messages in this tab",
    "点开一条消息即标为已读；「全部已读」会把四类一起清空。": "Opening a message marks it read; Mark all read clears all four tabs.",
    "共 ": "Total ",
    " 条": " items",
    " 条未读": " unread",
    " 条评论": " comments",
    " 条回复": " replies",
    " 楼": " floors",
    " 次安装": " installs",
    " 个条目": " entries",
    " 位": " members",
    " 张图": " images",
    " 字": " characters",
    " 分钟前": " min ago",
    " 小时前": " hr ago",
    " 天前": " days ago",
    " 秒后重发": "s to resend",
    "已选：": "Selected: ",
    "把「": "Mark “",
    "」标为已读": "” as read",

    /* ---------- 插件库 ---------- */
    "插件条目库": "Plugin library",
    "没有匹配的条目，换个关键词或档位试试": "No matching entries. Try another keyword or tier.",
    "条目库还没有内容：后端 /api/plugins 返回空。": "The library is empty: /api/plugins returned nothing.",
    "没有找到这个插件条目": "Plugin entry not found",
    "条目正文": "Entry details",
    "这个插件做什么": "What this plugin does",
    "安装": "Installation",
    "常见问题": "FAQ",
    "社群讨论": "Community discussion",
    "还没有人聊过这个插件，去社群开个帖吧": "No discussion yet. Start a thread in the community.",
    "认领之后，谁管什么": "What claiming means",
    "这个版本": "This version",
    "上传新版本": "Upload a new version",
    "作者可见数据": "Author-only data",
    "这个条目还没有下载数据": "No download data for this entry yet",
    "只有作者看得到": "Visible to the author only",
    "作者已登记安装包信息": "Author registered package info",
    "外链作者仓库": "External author repository",
    "仅条目，无下载": "Entry only, no download",
    "仅条目": "Entry only",
    "包信息已登记（名称 / 大小 / sha256），文件在作者仓库，按下面三步取": "Package info registered (name / size / sha256); the file is in the author's repository. Follow the three steps below.",
    "本站不存包，去作者仓库拿最新的": "This site does not host packages; get the latest from the author's repository.",
    "没有可用下载渠道，只有条目信息": "No download channel; entry information only.",
    "作者登记 · 跟随上游": "Author registered · tracks upstream",
    "作者登记 · 手动更新": "Author registered · manual updates",
    "社群登记转载信息": "Community-submitted repost info",
    "去作者 Releases 取包 ↗": "Get it from the author's Releases ↗",
    "去作者仓库下载 ↗": "Download from the author's repository ↗",
    "点击复制完整 sha256（64 位）": "Click to copy the full sha256 (64 characters)",
    "这个条目只登记了信息，没有包、也没有仓库地址，所以现在没有下载渠道。": "This entry only has information — no package and no repository URL, so there is no download channel.",
    "这个条目只有文字信息，没有安装包文件": "This entry has text information only; there is no package file",
    "取包请到作者仓库。": "Get the package from the author's repository.",
    "也没有仓库地址。": "There is no repository URL either.",
    "若你是作者并要求下架，": "If you are the author and want it removed, ",
    "按这里申请": "request removal here",
    "，24 小时内处理。": "; it will be handled within 24 hours.",
    "举报这个条目 / 安装包": "Report this entry / package",
    "收到举报后 24 小时内会撤掉对应的安装包信息（条目保留），全过程留档，处理结果会在下架记录页公示。": "Reported package info is removed within 24 hours (the entry stays). The whole process is logged and published on the takedown records page.",
    "发布插件": "Publish plugin",
    "插件名": "Plugin name",
    "仓库地址": "Repository URL",
    "提交审核": "Submit for review",
    "保存草稿": "Save draft",
    "已提交，等审核": "Submitted for review",
    "已提交，等人工审核": "Submitted for manual review",
    "主推版本": "Featured version",
    "已登记包": "Registered packages",
    "已认领": "Claimed",
    "个条目": "entries",
    "共 ": "Total ",
    "按收录日期排序": "sorted by date added",
    "本站已收录 ": "Collected ",
    "个条目": "entries",
    "去作者仓库": "Go to author repository",

    /* ---------- 社群 ---------- */
    "发新帖": "New post",
    "全部回复": "All replies",
    "这个主题不存在": "This topic does not exist",
    "回复内容不能为空": "Reply cannot be empty",
    "至少写两个字": "Write at least two characters",
    "登录后才能评论、回复与删除。": "Sign in to comment, reply and delete.",
    "说点具体的：你看到的光、形、做法，或者想问的": "Be specific: the light, shape or technique you see — or ask a question.",
    "发表评论": "Post comment",
    "发回复": "Post reply",
    "收起回复": "Collapse reply",
    "确认删除": "Confirm delete",
    "审核中": "Under review",
    "仅自己可见 · ": "Only visible to you · ",
    "评论已发布": "Comment posted",
    "回复已发出": "Reply posted",
    "评论已发出": "Comment posted",
    "已提交，审核通过后才会公开": "Submitted; visible after review",
    "再点一次确认删除，回复会一起删掉": "Click again to confirm; replies will be deleted too",
    "评论已删除": "Comment deleted",
    "还没有人说话。第一句可以留给细节，而不是「好看」。": "No comments yet. Start with a detail, not just “looks good”.",
    "基础审核：链接、手机号、广告词先压成「审核中」，只有你自己看得见": "Basic moderation: links, phone numbers and ad terms go to review first; only you can see them.",
    "没有找到匹配的作品，换个词试试，或点左栏「作品类型 · 全部」清掉筛选": "No matching works. Try another keyword or clear the filter in the left column.",
    "作品墙": "Art wall",
    "发布二创": "Publish fan art",
    "插画": "Illustration",
    "动图": "GIF",
    "短漫": "Comic",
    "3D 模型": "3D model",
    "手书": "Hand-drawn animation",
    "表情包": "Stickers",
    "原作与出处必须可查，否则请选「仅索引」": "Original work and source must be verifiable; otherwise choose “Index only”.",
    "只收 PNG / JPG / GIF / WebP": "PNG / JPG / GIF / WebP only",
    "只收 ": "Only ",
    " 这几种模型文件": " model formats are accepted",
    "图片读不出来，换一张试试": "Could not read the image. Try another.",
    "这张图处理失败，换一张试试": "Image processing failed. Try another.",
    "网络错误": "Network error",
    "已提交，等人工审核": "Submitted for manual review",
    "还没有发过作品": "No works yet",
    "去看看": "Take a look",
    "收起发布框": "Collapse publisher",
    "＋ 发布二创": "+ Publish fan art",
    "拖动 / 按住拖可以转视角": "Drag / hold to rotate the view",
    "暂停旋转": "Pause rotation",
    "继续旋转": "Resume rotation",
    "这个格式不解析，已按文件指纹生成示意低模": "This format is not parsed; a placeholder low-poly model was generated from the file fingerprint.",
    "这个文件读不出来，换一个试试": "Could not read this file. Try another.",
    "模型已解析 · ": "Model parsed · ",
    " 面": " faces",
    "真网格": "Real mesh",
    "示意网格": "Placeholder mesh",
    "只支持 PNG / JPG / GIF / WebP": "PNG / JPG / GIF / WebP only",
    "单张图片不能超过 5 MB": "Each image must be under 5 MB",
    "GIF 会原样保留动图": "GIF animation is preserved",
    "图片已就位": "Image ready",
    "待发布的作品预览": "Preview of works to publish",
    "给她起个名字": "Give it a name",
    "画的是什么、为什么想发出来": "What is it, and why publish it?",
    "画这张的人叫什么": "Who made this?",
    "作者本人发布": "Posted by the author",
    "发布者就是原作者": "The publisher is the original author",
    "已获授权": "Authorized",
    "已获作者授权": "Authorized by the author",
    "作者书面或私信同意转载": "The author agreed in writing or by message",
    "允许转载": "Reposting allowed",
    "作者公开允许转载": "The author publicly allows reposting",
    "作者在原帖写明可转载，需保留署名": "The author allows reposting with attribution",
    "仅索引": "Index only",
    "未获授权 · 仅索引": "Not authorized · index only",
    "没有授权，本站不存图，只记出处与原帖链接": "Not authorized; this site stores no image, only the source and original link.",
    "出处属实": "Source is accurate",
    "原作链接要以 http(s) 开头，点得开才算可追溯": "The original link must start with http(s) and open for verification.",
    "先勾一下「出处属实」那一条": "Check “Source is accurate” first.",
    "已挂上作品墙 · ": "Published to the art wall · ",
    "本站": "This site",
    "本人发布，署名即本账号": "Posted by me; the credit is this account",
    "原作链接": "Original link",
    "来源": "Source",
    "授权说明": "License note",
    "发布者": "Publisher",
    "作品类型": "Work type",
    "选择要关联的插件": "Choose a plugin to link",
    "关联插件": "Link plugin",
    "发布二创": "Publish fan art",

    /* ---------- 排行 / 赞助 ---------- */
    "AI 排行": "AI Ranking",
    "智能指数": "Intelligence index",
    "综合榜": "Overall",
    "输入价": "Input price",
    "输出价": "Output price",
    "上下文": "Context",
    "赞助鲸域": "Support WhaleRealm",
    "会员": "Member",
    "立即赞助": "Support now",
    "订单": "Order",
    "支付": "Payment",
    "积分": "Points",
    "会员天数": "Membership days",
    "还没有赞助记录": "No support records yet",

    /* ---------- 管理后台（主站入口） ---------- */
    "管理后台": "Admin",
    "控制台": "Console",
    "帖子管理": "Posts",
    "用户管理": "Users",
    "奖励发放": "Rewards",
    "权限管理": "Permissions",
    "操作日志": "Audit log",
    "工作台": "Dashboard"
  };

  var PATTERNS = [
    [/^共\s*(\d+)\s*条$/, "$1 items"],
    [/^共\s*(\d+)\s*位$/, "$1 members"],
    [/^共\s*(\d+)\s*个条目$/, "$1 entries"],
    [/^共\s*(\d+)\s*个插件$/, "$1 plugins"],
    [/^共\s*(\d+)\s*楼\s*·\s*(\d+)\s*条已展示回复$/, "$1 floors · $2 replies shown"],
    [/^共\s*(\d+)\s*条\s*·\s*(\d+)\s*条未读$/, "$1 items · $2 unread"],
    [/^(\d+)\s*条评论$/, "$1 comments"],
    [/^(\d+)\s*条回复$/, "$1 replies"],
    [/^(\d+)\s*条未读$/, "$1 unread"],
    [/^(\d+)\s*个条目\s*·\s*按收录日期排序$/, "$1 entries · sorted by date added"],
    [/^本站已收录\s*(\d+)\s*个条目$/, "$1 entries collected"],
    [/^(\d+)\s*次安装$/, "$1 installs"],
    [/^(\d+)\s*分钟前$/, "$1 min ago"],
    [/^(\d+)\s*小时前$/, "$1 hr ago"],
    [/^(\d+)\s*天前$/, "$1 days ago"],
    [/^(\d+)\s*秒后重发$/, "Resend in $1s"],
    [/^全部\s*(\d+)\s*›$/, "All $1 ›"],
    [/^第\s*(\d+)\s*\/\s*(\d+)\s*页$/, "Page $1 / $2"],
    [/^(\d+)\s*\/\s*(\d+)$/, "$1 / $2"],
    [/^已选：(.+)$/, "Selected: $1"],
    [/^消息中心，\s*(\d+)\s*条未读$/, "Message center, $1 unread"],
    [/^消息中心，没有未读$/, "Message center, no unread"],
    [/^(.+)\s*·\s*(\d+)\s*条已展示回复$/, "$1 · $2 replies shown"],
    [/^(.+)\s*的插件$/, "$1's plugins"],
    [/^(.+)\s*的个人空间$/, "$1's space"],
    [/^(.+)\s*的空间$/, "$1's space"],
    [/^更新了\s*(.+)$/, "updated $1"],
    [/^今日\s*(\d+)\s*条更新$/, "$1 updates today"],
    [/^查看全部\s*(\d+)\s*条评论$/, "View all $1 comments"],
    [/^外链\s*·\s*(\d+)\s*次安装$/, "External · $1 installs"],
    [/^(.+)\s*·\s*(\d+)\s*次安装$/, "$1 · $2 installs"]
  ];

  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var SKIP = [
    "[data-i18n-skip]", ".post-text", ".post-title", ".post-author", ".post-time",
    ".md", ".cmt-text", ".cm-text", ".cm-nick", ".cm-reason", ".chat-text",
    ".nt-main", ".nt-main *", ".gh-repo", ".doc-sec", ".art-desc", ".user-bio",
    ".sign", ".profile-bio", ".floor", ".cmt", ".dm-msg", ".msg-text", ".au-tx",
    ".thread-title", ".entry-title", ".plugin-title", ".art-title", ".avatar-btn span",
    ".brand", ".logo", ".user-name", ".nick", ".msg-title", ".dm-name", ".dm-preview",
    "[contenteditable]", "textarea", "pre", "code", "script", "style"
  ].join(",");
  var UI = [
    "button", "a", "label", "th", "td", "h1", "h2", "h3", "h4", "option",
    ".tab", ".chip", ".pill", ".empty", ".set-k", ".set-v", ".page-hd", ".card-hd",
    ".side-hd", ".rail-hd", ".nav", ".footer", ".m-tabbar", ".pager", ".hint",
    ".sub", ".meta", ".stat", ".kpi", ".modal", ".drawer", ".pop", ".auth",
    ".toolbar", ".seg", ".field", ".set-sec", ".set-row", ".card-bd", ".hero",
    ".sort", ".sorts", ".pin", ".plugin-chip", ".cbox", ".rail-item", ".sx", ".pp-tx",
    ".auth-hd", ".auth-note", ".auth-legal", ".phone-step", ".dev-row", ".dm-side",
    ".dm-head", ".msg-head", ".rp-box", ".form-row", ".form-hint", ".seg-btn",
    ".fchip", ".tag", ".tag-badge", ".badge", ".nav-act", ".icon-btn", ".lang-switch",
    ".me-card", ".cover-txt .slogan", ".cover-txt .today"
  ].join(",");

  var origText = new WeakMap();
  var origAttr = new WeakMap();
  var applying = false;
  var observer = null;

  function translate(s) {
    if (lang !== "en") return s;
    var t = String(s).trim();
    if (!t || t.length > 180) return s;
    if (Object.prototype.hasOwnProperty.call(DICT, t)) return DICT[t];
    for (var i = 0; i < PATTERNS.length; i++) {
      var re = PATTERNS[i][0];
      if (re.test(t)) return t.replace(re, PATTERNS[i][1]);
    }
    return s;
  }

  function isSkipped(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest("[data-i18n-skip]")) return true;
    return !!(el.closest && el.closest(SKIP));
  }

  function isUI(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isSkipped(el)) return false;
    return !!(el.closest && el.closest(UI));
  }

  function swapText(node) {
    var parent = node.parentNode;
    if (!parent || !isUI(parent)) return;
    var raw = node.nodeValue;
    if (!raw) return;
    var m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m) return;
    var core = m[2];
    if (!core) return;
    var out = translate(core);
    if (out === core) return;
    var rec = origText.get(node);
    if (lang === "en") {
      if (!rec) origText.set(node, { orig: raw, out: m[1] + out + m[3] });
      node.nodeValue = m[1] + out + m[3];
    } else if (rec && node.nodeValue === rec.out) {
      node.nodeValue = rec.orig;
      origText.delete(node);
    }
  }

  function swapAttr(el, name) {
    var raw = el.getAttribute(name);
    if (raw == null || !raw) return;
    var out = translate(raw);
    if (out === raw) return;
    var rec = origAttr.get(el);
    if (!rec) { rec = {}; origAttr.set(el, rec); }
    if (lang === "en") {
      if (!Object.prototype.hasOwnProperty.call(rec, name)) rec[name] = raw;
      el.setAttribute(name, out);
    } else if (rec[name] != null && el.getAttribute(name) === out) {
      el.setAttribute(name, rec[name]);
      delete rec[name];
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { swapText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var node = root;
    while (node) {
      if (node.nodeType === 3) {
        swapText(node);
      } else if (node.nodeType === 1) {
        if (node.tagName === "TEXTAREA") {
          /* textarea 的文本是用户输入，不能翻；placeholder 仍是界面文案，单独放行。 */
          if (!node.closest("[data-i18n-skip]")) swapAttr(node, "placeholder");
        } else if (!isSkipped(node)) {
          for (var i = 0; i < ATTRS.length; i++) swapAttr(node, ATTRS[i]);
        }
      }
      node = walker.nextNode();
    }
  }

  function observe() {
    if (!observer || !document.body) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function apply(root) {
    if (applying) return;
    applying = true;
    if (observer) observer.disconnect();
    try { walk(root || document.body); } finally {
      observe();
      applying = false;
    }
  }

  function set(next) {
    if (next !== "en" && next !== "zh") return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.documentElement.setAttribute("data-lang", lang);
    apply(document.body);
    try { window.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: lang } })); } catch (e) {}
  }

  function t(zh, en) { return lang === "en" ? en : zh; }

  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.documentElement.setAttribute("data-lang", lang);

  window.I18N = {
    lang: function () { return lang; },
    t: t,
    set: set,
    toggle: function () { set(lang === "en" ? "zh" : "en"); },
    apply: apply,
    translate: translate,
    _dict: DICT
  };

  function boot() {
    if (!document.body) return;
    observer = new MutationObserver(function () {
      if (applying) return;
      apply(document.body);
    });
    observe();
    apply(document.body);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
