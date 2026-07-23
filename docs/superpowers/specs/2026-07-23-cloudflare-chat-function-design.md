# Cloudflare Pages AI 助手迁移设计

## 目标

在现有 Cloudflare Pages 站点上恢复同源 `/api/chat` 接口，复用已经验证过的知识库、DeepSeek 调用、SSE 输出与访客限流逻辑，不把任何密钥写入 GitHub 或客户端。

## 当前问题与证据

- Cloudflare Pages 已成功托管 Vite 静态站点。
- 请求 `/api/chat` 当前返回首页 HTML，而不是聊天 API 响应。
- 原因是现有入口位于 `api/chat.ts`，这是 Vercel Function 约定；Cloudflare Pages 使用根目录下的 `functions/` 文件路由。
- 现有共享运行时直接依赖 `node:crypto` 和 `@vercel/functions/headers`，不能作为平台无关的 Cloudflare Worker 核心。

参考：

- <https://developers.cloudflare.com/pages/functions/>
- <https://developers.cloudflare.com/pages/functions/routing/>
- <https://developers.cloudflare.com/pages/functions/bindings/>

## 架构

### 平台无关聊天核心

保留现有检索、Prompt、DeepSeek Provider、SSE、引用和 Upstash 限流模块。将平台差异限制在入口适配器中：

- 共享运行时只使用 Web Platform API。
- 请求 ID 使用注入函数，默认使用 `globalThis.crypto.randomUUID()`。
- 访客 IP 通过注入函数提供，不在共享运行时中引用 Vercel 包。
- 运行时环境由入口显式传入，不在共享代码内假定 `process.env`。

### Cloudflare Pages Function

新增 `functions/api/chat.ts`：

- 只接受 `POST`。
- 从 `context.env` 读取配置与密钥。
- 从可信的 `CF-Connecting-IP` 请求头读取访客 IP。
- 调用共享聊天运行时并原样返回 SSE 或 JSON 错误响应。
- 对其他方法返回 `405 Method Not Allowed`，不再回退到 SPA 首页。

### Vercel 兼容入口

保留 `api/chat.ts`，将 Vercel 的环境变量和 IP 提取适配到同一个共享运行时，避免本次迁移破坏现有 Vercel Preview。

### 路由边界

在构建输出中加入 `_routes.json`：

- Functions 仅覆盖 `/api/*`。
- 首页、JS、CSS、粒子人像、分页图片、PDF 和 PPTX 均走 Cloudflare 静态资产路径。

## 环境变量与密钥

Cloudflare Production 环境需要配置：

- `DEEPSEEK_API_KEY`：加密 Secret
- `RATE_LIMIT_KV_TOKEN`：加密 Secret
- `RATE_LIMIT_SALT`：加密 Secret
- `RATE_LIMIT_KV_URL`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `CHAT_ENABLED=true`
- `CHAT_SITE_DAILY_LIMIT=300`
- `CHAT_VISITOR_DAILY_LIMIT=30`
- `CHAT_VISITOR_MINUTE_LIMIT=6`
- `CHAT_COOLDOWN_SECONDS=3`
- `CHAT_MAX_OUTPUT_TOKENS=700`
- `CHAT_UPSTREAM_TIMEOUT_MS=45000`

本地 `.env.local`、`.dev.vars` 及其环境变体必须继续被 Git 忽略。

## 数据流

1. 访客在首页提交问题。
2. 浏览器同源 `POST /api/chat`。
3. Pages Function 读取 Cloudflare IP 与绑定变量。
4. Upstash 执行站点及访客限流。
5. 本地知识索引执行混合检索。
6. Function 调用 DeepSeek `deepseek-v4-flash`。
7. SSE 将回答、引用、限额信息和结束事件流式返回浏览器。

## 错误处理

- 非 POST：`405` JSON 响应并携带 `Allow: POST`。
- 缺失或无效环境变量：`503 chat_disabled`，不泄露具体密钥名称和值。
- 超出限额：保留既有公开限流错误与重试时间。
- DeepSeek 超时或上游失败：保留既有可重试错误，不返回上游响应正文。
- Upstash 不可用：采用现有安全失败策略，不绕过限流。

## 测试与验收

- Cloudflare 入口在缺少配置时返回 `503`，而不是 HTML。
- `GET /api/chat` 返回 `405`。
- `POST /api/chat` 将 `context.env` 和 `CF-Connecting-IP` 正确传入共享运行时。
- Vercel 入口回归测试继续通过。
- 生产构建不把 DeepSeek、Upstash 密钥打入客户端 bundle。
- 部署后 `/api/chat` 的内容类型不再是 `text/html`。
- 真实推荐问题能收到 SSE 回答与可点击引用。

## 发布

1. 完成本地测试、构建与密钥扫描。
2. 推送 `feature/portfolio-ai-chat-clean` 到 GitHub。
3. Cloudflare Pages 自动构建。
4. 在 Cloudflare Production 的 Variables and Secrets 中填写配置。
5. 重新部署后执行真实 API 验收。

