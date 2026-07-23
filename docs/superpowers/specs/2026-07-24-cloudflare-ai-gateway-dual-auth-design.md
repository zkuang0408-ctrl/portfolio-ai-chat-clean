# Cloudflare AI Gateway + DeepSeek 双重认证设计

## 目标

让 Cloudflare Pages 首页的 `/api/chat` 同时通过 Cloudflare AI Gateway 认证和 DeepSeek Provider 认证，继续使用用户自己的 DeepSeek Key、现有模型、知识库、SSE 与 Upstash 限流，不复用短期 Wrangler OAuth 凭据，也不切换到 Cloudflare 统一计费模型。

## 当前证据

- Production 已显式配置 `env.production.ai`，Function 能通过 `env.AI.gateway("default").getUrl("deepseek")` 取得 Gateway 地址。
- AI Binding 缺失时的安全关闭逻辑和并发初始化测试均通过。
- Production 请求不再返回 `chat_disabled`，证明 AI Binding 初始化成功。
- Provider Native 请求仍在收到 HTTP 状态前失败，Cloudflare 日志只记录脱敏类别 `network`。
- Cloudflare 官方文档要求 Provider Native Gateway 请求使用 `cf-aig-authorization` 认证 Cloudflare Gateway；DeepSeek Key 仍放在标准 `Authorization` 头中。

参考：

- <https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/>
- <https://developers.cloudflare.com/ai-gateway/usage/providers/deepseek/>
- <https://developers.cloudflare.com/ai-gateway/get-started/>

## 方案比较

### A2. Gateway Token + DeepSeek Key（采用）

请求携带两套相互独立的凭据：

- `cf-aig-authorization: Bearer <Cloudflare API Token>`：认证 Cloudflare AI Gateway。
- `authorization: Bearer <DeepSeek API Key>`：由 Gateway 转发并认证 DeepSeek。

优点是保持当前模型、DeepSeek 账户、同源 API 和 Cloudflare Pages 架构。代价是新增一个 Cloudflare Secret，以及一项严格限制在 Gateway 请求上的请求头。

### B. Vercel Production 独立 API

Cloudflare 托管前端，Vercel 托管聊天 API。需要迁移 Preview Secrets、开放稳定 Production 域名和 CORS，并且中国大陆网络可达性不确定。因此只在 A2 真实生产验证仍失败时另行设计。

### C. Workers AI / Unified Billing

不需要 DeepSeek Key，但会改变模型或计费来源，不符合当前约束。

## Cloudflare Token 权限

用户在 Cloudflare Dashboard 创建专用 API Token，作用域仅限当前 Cloudflare 账户，权限采用官方默认 Gateway 初始化所需的最小集合：

- Account / AI Gateway / Read
- Account / AI Gateway / Edit
- Account / Workers AI / Read

Token 不发送到聊天，不写入 Git，不用于浏览器，不与 Wrangler OAuth Token 混用。它只保存为 Cloudflare Production Secret：

```text
CLOUDFLARE_AI_GATEWAY_TOKEN
```

如果 Dashboard 的权限名称显示为 `AI Gateway Read`、`AI Gateway Edit` 和 `Workers AI Read`，选择对应项即可。

## 代码架构

### Runtime 配置

`src/chat/server/runtime.ts` 新增可选的 `CLOUDFLARE_AI_GATEWAY_TOKEN`：

- DeepSeek 官方直连地址：不要求 Gateway Token，Vercel 行为保持不变。
- Cloudflare DeepSeek Gateway 地址：必须同时存在 Gateway Token，否则运行时安全关闭。
- Token 只在服务器端传入 `DeepSeekProviderOptions`。

### DeepSeek Provider

`src/chat/server/deepseek-provider.ts` 新增 `gatewayToken?: string`：

- API Key 和 Gateway Token 均执行长度、ASCII 与空白规范化检查。
- 目标地址为 Cloudflare Gateway 时添加 `cf-aig-authorization`。
- 目标地址为 DeepSeek 官方地址时禁止发送 `cf-aig-authorization`。
- `authorization` 始终只包含 DeepSeek Key。

通过这一边界，Cloudflare Token 不会意外发送给 DeepSeek 官方域名，DeepSeek Key 也不会取代 Gateway 认证。

### Cloudflare 入口

`functions/api/chat.ts` 继续只负责：

- 使用 AI Binding 解析 Provider Native URL。
- 把字符串类型 Secrets 交给共享运行时。
- 记录固定、脱敏的配置或 Provider Failure 类别。

入口不读取 Token 内容、不拼接认证头，也不把 Token 写入日志。

### Vercel 兼容

Vercel 的 `DEEPSEEK_BASE_URL=https://api.deepseek.com` 不需要 `CLOUDFLARE_AI_GATEWAY_TOKEN`。现有 Vercel Preview 不会因为缺少该变量而关闭。

## 数据流

1. 浏览器同源请求 Cloudflare `/api/chat`。
2. AI Binding 返回当前账户 `default` Gateway 的 DeepSeek Provider Native 地址。
3. Runtime 校验 Gateway URL、DeepSeek Key、Gateway Token 与 Upstash 配置。
4. 本地知识库检索相关简历和作品证据。
5. Provider 向 Gateway 同时发送 `cf-aig-authorization` 和 DeepSeek `authorization`。
6. Gateway 验证 Cloudflare Token，并把 DeepSeek Key 转发给 DeepSeek。
7. 回答按现有 SSE 协议返回 `start`、`delta`、`sources`、`usage` 和 `done`。

## 安全与错误处理

- 两个 Token 均只存在于服务器内存和加密 Secret。
- Gateway Token 只允许发往严格匹配的 `gateway.ai.cloudflare.com/v1/.../deepseek`。
- 缺失、空白、超长或包含不可打印字符的 Token 使聊天安全关闭。
- Provider 日志继续只记录固定类别，不记录 URL、请求头、Token、Prompt 或上游正文。
- Gateway 返回 `401/403` 时公开响应仍为通用 `upstream_unavailable`，生产日志可记录脱敏 `authentication` 类别。
- 不自动回退到其他模型或 Vercel。

## 测试与验收

### 单元测试

- Cloudflare Gateway 请求同时包含正确的两个认证头。
- DeepSeek 官方直连请求不包含 `cf-aig-authorization`。
- Gateway URL 缺少 Gateway Token 时 Runtime 安全关闭。
- DeepSeek 官方直连在缺少 Gateway Token 时仍启用。
- Token 的空白规范化、长度和 ASCII 边界均受测试保护。
- 现有 603 项测试全部继续通过。

### 构建与安全检查

- TypeScript、Vite、知识库 8/139、作品 6/135 和客户端 bundle 边界检查通过。
- `.env.example` 只记录新变量名，不包含值。
- Git 跟踪文件密钥扫描继续通过。

### Production 验收

- Cloudflare Secret 列表出现 `CLOUDFLARE_AI_GATEWAY_TOKEN`，只显示 `Value Encrypted`。
- 正式域名返回 `text/event-stream`。
- 真实问题至少出现 `delta`、`sources` 和 `done`。
- 日志不再出现 `portfolio_chat_upstream_failure`。
- 若仍失败，停止 A2，不扩大权限、不输出 Token，并转入方案 B 的独立设计。

## 发布与回退

1. 用户在 Cloudflare Dashboard 创建专用 Token，但不把值发送到聊天。
2. 通过本机交互式 Wrangler 命令写入 Production Secret。
3. 完成 TDD、全量测试、构建与密钥扫描。
4. 推送同一提交并部署 Cloudflare Production。
5. 真实 SSE 和脱敏日志验收通过后才宣布 AI 功能恢复。
6. 验收失败时保留当前静态站点和已有 Secrets，回退 Function 部署或进入方案 B。
