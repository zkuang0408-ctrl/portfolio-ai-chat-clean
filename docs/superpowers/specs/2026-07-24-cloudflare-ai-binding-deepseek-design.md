# Cloudflare AI Binding + DeepSeek BYOK 设计

## 目标

在现有 Cloudflare Pages 首页恢复可用的同源 `/api/chat`，继续使用用户自己的 DeepSeek API Key、现有知识库、SSE、引用和 Upstash 限流，不切换模型、不启用 Cloudflare 第三方模型统一计费，也不改动前端布局。

## 当前证据

- Cloudflare Pages 静态站点、135 页高清作品图片和同源 `/api/chat` 路由均已上线。
- Upstash 配置有效，聊天请求能够通过限流阶段并进入模型调用阶段。
- Pages Function 直接请求 `https://api.deepseek.com` 时，Cloudflare 日志记录为模型请求前的 `network` 失败。
- 改为 `gateway.ai.cloudflare.com` 并启用 `global_fetch_strictly_public` 后，Pages Function 内部仍在收到 HTTP 状态前失败。
- 同一 Gateway URL 从普通公网客户端可以连接并返回明确的 `401`，说明 URL 与 DNS 本身有效，但需要 Cloudflare 账户身份。
- Cloudflare 官方 AI Binding 提供 `env.AI.gateway(id).getUrl(provider)`，用于在 Worker 内取得账户所属 Gateway 的 Provider Native 地址；Provider Native 调用仍可携带用户自己的 Provider Key。

## 方案比较

### A. Cloudflare AI Binding + DeepSeek BYOK（采用）

Pages Function 使用 `env.AI` 绑定取得 `default` Gateway 的 DeepSeek 地址，再复用现有 `DeepSeekProvider` 发起请求。

优点：

- 首页、API 和作品仍在同一 Cloudflare Pages 项目中。
- DeepSeek Key 继续由 Cloudflare Secret 保存。
- 不改变模型、Prompt、检索、限流或 SSE 协议。
- 不依赖 Vercel 在中国大陆的可访问性。

风险：

- 必须通过生产部署验证 Provider Native 请求是否能在 Pages AI Binding 环境中使用 BYOK。
- 如果 Cloudflare 当前账户或套餐不允许该链路，应明确失败并回退到独立 API 部署方案，而不是静默换模型。

### B. Vercel 独立聊天 API

Cloudflare 继续托管静态站，浏览器跨域调用 Vercel Production API。

优点是现有 Vercel Preview 已有完整变量；缺点是需要生产变量迁移、CORS、稳定域名和国内网络可达性处理。因此仅作为 A 的后备方案。

### C. Cloudflare Workers AI / Unified Billing

通过 `env.AI.run()` 使用 Cloudflare 托管模型或统一计费的第三方模型。链路最原生，但会改变模型或计费来源，不符合本轮“继续使用 DeepSeek Key”的约束。

## 架构

### Cloudflare 入口适配器

`functions/api/chat.ts` 负责 Cloudflare 专属行为：

- 从 `context.env.AI` 获取 AI Binding。
- 调用 `env.AI.gateway("default").getUrl("deepseek")`。
- 去掉返回地址末尾的单个 `/`，再交给共享运行时的既有严格白名单校验。
- 仅复制字符串类型的环境变量，不把 AI Binding 对象传入平台无关运行时。
- 缓存运行时初始化 Promise，避免并发首请求重复创建检索器。

### 平台无关运行时

`src/chat/server/runtime.ts` 和 `DeepSeekProvider` 保持平台无关：

- 仍只接受 DeepSeek 官方地址或严格匹配的 Cloudflare DeepSeek Gateway 地址。
- 继续把 `DEEPSEEK_API_KEY` 放在 Provider Native 请求的 `Authorization` 头中。
- 不导入 Cloudflare SDK，不依赖 `env.AI` 类型。

### Cloudflare 配置

`wrangler.toml` 新增：

```toml
[ai]
binding = "AI"
```

保留当前 Pages 项目名、输出目录、兼容日期和 `global_fetch_strictly_public`。现有 Secrets、Upstash 配置与聊天限额不写入 Git，也不改名。

### Vercel 兼容

`api/chat.ts` 与 Vercel Runtime 不使用 AI Binding，继续从 Vercel 环境变量读取 `DEEPSEEK_BASE_URL`。本轮不会将 Cloudflare 绑定逻辑扩散到共享模块或 Vercel 入口。

## 数据流

1. 访客在 Cloudflare 首页同源提交 `/api/chat`。
2. Pages Function 使用 AI Binding 取得当前账户 `default` Gateway 的 DeepSeek Provider Native 地址。
3. 共享运行时执行同源校验、请求校验和 Upstash 限流。
4. 本地知识索引检索与问题相关的简历、项目和作品证据。
5. `DeepSeekProvider` 携带 Cloudflare Secret 中的 DeepSeek Key，经 Gateway 请求 DeepSeek。
6. 回答以现有 SSE 事件流返回，包含正文、来源、用量与结束事件。

## 安全与失败策略

- DeepSeek Key、Upstash Token 和 Salt 永不进入客户端 bundle、Git、URL或日志。
- Gateway URL 必须通过既有 HTTPS 主机与路径白名单。
- AI Binding 缺失、`getUrl()` 失败或返回不合规地址时，聊天以 `503 chat_disabled` 关闭；日志只记录固定的配置类别。
- Provider 认证、余额、限流、超时和网络错误继续映射为现有公开错误，不返回上游正文。
- 不自动回退到其他模型，避免回答质量、费用和隐私边界在用户不知情时改变。

## 测试

### 单元测试

- AI Binding 成功返回 DeepSeek Gateway URL时，Cloudflare 入口把规范化地址传给共享运行时。
- 返回末尾 `/` 时只做规范化，不放宽运行时白名单。
- AI Binding 缺失、抛错或返回恶意地址时安全关闭聊天。
- 并发首请求只初始化一次运行时。
- Vercel Runtime、DeepSeek 请求格式、SSE、引用和限流测试继续通过。

### 构建与安全验证

- 全量 Vitest 通过。
- TypeScript 与 Vite 生产构建通过。
- 知识索引保持 8 个来源、139 个片段。
- 作品页资产保持 6 个项目、135 页。
- 客户端 bundle 边界检查通过。

### 生产验收

- Cloudflare Production 能收到 `text/event-stream`。
- 真实问题至少收到一个 `delta`、一个 `sources` 和最终 `done` 事件。
- 回答包含与问题匹配的作品或简历来源。
- Cloudflare 日志不再出现 `network` Provider Failure。
- 首页对话框、作品展示和静态资源缓存无回归。

## 发布与回退

1. 完成单元测试、全量测试和构建。
2. 推送同一提交到 GitHub 功能分支。
3. 部署 Cloudflare Production，并验证 AI Binding 已存在。
4. 执行真实 SSE 问答与日志检查。
5. 验收失败时回退到上一稳定 Pages 部署；不删除用户 Secrets。
6. 若失败证据表明 Provider Native BYOK 在当前 Cloudflare 环境不可用，再单独设计方案 B，不在本轮混入跨域代理。
