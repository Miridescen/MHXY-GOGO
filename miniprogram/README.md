# 狗脑发热 · 藏宝阁比价小程序（Taro）

一套代码，编译到 **微信 / 抖音** 小程序。功能与网站一致：全服/本服比价、角色境界·锦衣·坐骑全服最低价矩阵、物品列表。

## 目录
- `src/pages/index/` — 主页面（界面+逻辑）
- `src/utils/api.ts` — 数据层（接口地址、类型、比价函数）
- `config/` — Taro 构建配置

## 接口地址（重要）
`src/utils/api.ts` 顶部的 `API_BASE`：
- 生产 = `https://dogfever.cn`（广州腾讯云，已备案+HTTPS）
- 小程序后台「服务器域名」里需把 `https://dogfever.cn` 加进 `request 合法域名`

## 本地开发（先装一次依赖）
```bash
cd miniprogram
npm install
```

### 微信端
```bash
npm run dev:weapp     # 编译到 dist/（watch）
```
然后用 **微信开发者工具** → 导入项目 → 目录选 `miniprogram/`（它读 `project.config.json`，小程序根目录是 `dist/`）→ 填你的微信 AppID。
> 开发阶段：开发者工具右上「详情 → 本地设置 → 勾选『不校验合法域名…』」，才能连 8090 接口。

### 抖音端
```bash
npm run dev:tt        # 编译到 dist/
```
用 **抖音开发者工具** 导入 `miniprogram/`，填抖音 AppID。

## 上线前
- 微信、抖音各自：注册账号 → 配 AppID → 后台配请求域名（须备案 + HTTPS 443，不能带端口）→ 提交审核
- 「去购买」因小程序限制改为**复制藏宝阁链接**（不能直接外跳网页）
