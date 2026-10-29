# 收款码图片放这里

`css/membership.css` 的 `.vip-manual-qr` 用背景图引用本目录的 `manual.png`：

```css
background: var(--card) url("../assets/pay/manual.png") center/contain no-repeat;
```

源文件路径 `css/membership.css` → `assets/pay/manual.png`；
产物路径 `dist/assets/membership.<hash>.css` → `dist/assets/pay/manual.png`。
两边相对位置一致，所以同一行 CSS 不用改就能在源码和产物里都生效。

## 放什么

| 文件 | 说明 |
| --- | --- |
| `manual.png` | 微信个人收款码（或经营账户收款码）截图，正方形，建议 600×600 以上的 PNG。**不要带个人手机号/真实姓名水印**，会被爬。 |

## 为什么不用 `<img onerror>`

站点的 CSP `script-src` 只有 `'self'` 加三条 sha256 哈希，没有 `unsafe-inline`，
所以内联事件处理器（`onerror=` / `onload=`）会被浏览器直接拦掉。
图缺失时不做降级提示，只留 CSS 里的虚线框 —— 那本身就是「这里该有张码」的视觉占位。

## 换码要不要重新构建

不用。构建只把文件拷进 `dist/assets/pay/`，文件名不变；
但**必须**重新执行一次部署把新文件同步上去（`deploy/build.mjs` + 上传），
否则线上还是旧图。

## 安全提醒

收款码是公开信息，任何人拿到都能给你转账（拿不到你的钱）。真正的风险在反方向：
**任何声称「我付了」的人都不需要出示凭证**。所以付款核对依赖
`POST /api/membership/orders/:orderNo/report-paid` 记下的「付款人昵称 + 时间」，
配合微信账单按备注里的订单号人工对账。
