# 腾讯云 TokenHub 直连设计

## 目标

让 Cloudflare Pages 首页的 `/api/chat` 直接调用腾讯云 TokenHub 广州 OpenAI 兼容接口，使用用户已创建的独立 TokenHub API Key 和 DeepSeek-V4-Flash 原厂直供模型，保留现有知识库、SSE、作品来源、Upstash 限流与首页交互。

这是一项恢复 AI 助手的过渡方案。它减少了跨平台跳转，但不宣称 Cloudflare Pages 已获得中国大陆境内托管、ICP备案或大陆网络 SLA。

## 已知事实

- 当前 Cloudflare Production 静态站点正常返回 HTTP 200。
- Cloudflare Pages Function、知识检索和 Upstash 已进入 Provider 调用阶段。
- Cloudflare AI Gateway + DeepSeek 双认证版本已部署，但真实请求稳定记录脱敏 `network` 类别，未获得上游 HTTP 响应。
- 用户已在腾讯云 TokenHub 为 DeepSeek-V4-Flash 原厂直供模型领取 1,000,000 Tokens 免费额度，并创建独立 API Key。
- 腾讯云官方文档确认：
  - 广州 OpenAI 兼容 Base URL 为 `https://tokenhub.tencentmaas.com/v1`。
  - 原厂直供模型 ID 为 `deepseek-v4-flash-202605`。
  - 接口支持 OpenAI Chat Completions、SSE、`stream_options.include_usage`。
  - 该模型支持 `"thinking":{"type":"disabled"}`。
  - 原厂直供模型由 DeepSeek 直接提供，腾讯文档明确说明 TokenHub 不为该版本提供 SLA 保障。

参考：

- <https://cloud.tencent.com/document/product/1823/130079>
- <https://cloud.tencent.com/document/product/1823/132248>
- <https://cloud.tencent.com/document/product/1823/131208>
- <https://cloud.tencent.com/document/product/1823/130090>

## 方案比较

### A. 独立 TokenHub 适配（采用）

增加 TokenHub 专用 Secret 和严格固定的 Provider 地址，在 Cloudflare 入口把 TokenHub 配置映射到共享 Runtime，复用已经经过大量测试的 DeepSeek Chat Completions 与 SSE 解析逻辑。

优点：

- 不覆盖或混淆现有 DeepSeek Key。
- 不增加 Vercel 中转和浏览器 CORS。
- 保留当前 UI、知识库、限流和错误协议。
- 改动范围集中，容易回退。

代价：

- `DeepSeekProvider` 同时支持 DeepSeek 官方地址、Cloudflare DeepSeek Gateway 和腾讯 TokenHub 上的 DeepSeek 模型。
- 当前原厂直供版本不享受 TokenHub SLA；计费、可用性和输出细节也可能与 DeepSeek 官方接口不同。

### B. 通用 OpenAI-Compatible Provider 重构

把 Provider、配置变量和测试整体重命名为通用协议层。结构更通用，但会扩大本次恢复任务的代码面、迁移风险和回归成本，不符合最小改动原则。

### C. 覆盖旧 `DEEPSEEK_API_KEY`

直接把 TokenHub Key 填入旧变量。操作最快，但容易让腾讯 Key 被误发给 Cloudflare Gateway 或 DeepSeek 官方域名，且变量语义错误，因此不采用。

## 配置边界

### 新增 Cloudflare Production Secret

```text
TENCENT_TOKENHUB_API_KEY
```

该值只由用户通过 Wrangler 隐藏式交互提示写入 Cloudflare Pages Production。它不得：

- 发送到 Codex 聊天；
- 写入 `.env.example` 以外的值；
- 写入 Git、GitHub、构建产物或浏览器代码；
- 出现在日志、错误响应、URL 或查询参数中。

`.env.example` 只增加空变量名：

```dotenv
TENCENT_TOKENHUB_API_KEY=
```

### 固定服务配置

Cloudflare 入口使用代码常量，不接受可任意配置的 TokenHub URL：

```text
Base URL: https://tokenhub.tencentmaas.com/v1
Model:    deepseek-v4-flash-202605
```

固定地址防止 Production Secret 或 Dashboard 变量把 TokenHub Key 重定向到非授权域名。模型固定为用户在截图中领取额度和创建访问范围的原厂直供版本。

### 旧配置

以下旧配置在 TokenHub 首次生产验证前保留：

- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`
- Cloudflare `AI` binding
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`

TokenHub 路径不得读取或发送前两项旧密钥。生产验证成功后，另行执行最小清理：删除未使用的 Cloudflare Gateway Secret 和 binding；DeepSeek Key 是否保留由用户决定。

## 代码架构

### Provider 地址白名单

`src/chat/server/deepseek-provider.ts` 增加精确常量：

```ts
export const TENCENT_TOKENHUB_BASE_URL =
  "https://tokenhub.tencentmaas.com/v1";
```

`isApprovedDeepSeekBaseUrl` 只允许：

1. `https://api.deepseek.com`
2. 当前严格格式的 Cloudflare Gateway DeepSeek URL
3. `https://tokenhub.tencentmaas.com/v1`

尾部斜线、HTTP、子域替换、路径变化、查询参数、用户名、端口和片段均不接受。

Provider 请求 TokenHub 时：

- `authorization` 只包含 TokenHub API Key。
- 不发送 `cf-aig-authorization`。
- 继续发送 `content-type: application/json`。
- 请求路径为 `/v1/chat/completions`。
- 请求体保留官方已说明支持的 `messages`、`thinking.disabled`、`temperature`、`max_tokens`、`stream` 与 `stream_options.include_usage`。
- TokenHub 请求不发送官方公共参数列表未声明的 `user_id`；DeepSeek 官方地址和 Cloudflare Gateway 的现有匿名 `user_id` 行为保持不变。

### Runtime 配置

共享 `src/chat/server/runtime.ts` 继续接收标准化的：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`

这样 Vercel 直连和现有单元测试保持兼容。Runtime 仍按目标地址决定是否要求 `CLOUDFLARE_AI_GATEWAY_TOKEN`；TokenHub 地址不要求 Gateway Token。

### Cloudflare 入口

`functions/api/chat.ts` 的初始化顺序调整为：

1. 从字符串环境读取 `TENCENT_TOKENHUB_API_KEY`。
2. Key 存在时，使用固定 TokenHub Base URL 和固定模型创建共享 Runtime。
3. Key 缺失或非法时，安全关闭聊天并只记录固定事件
   `{"event":"portfolio_chat_configuration_failure","category":"tokenhub_key"}`。
4. 不再调用 `env.AI.gateway(...).getUrl("deepseek")` 作为主路径。

映射只发生在服务器内存中：

```text
DEEPSEEK_API_KEY  <- TENCENT_TOKENHUB_API_KEY
DEEPSEEK_BASE_URL <- https://tokenhub.tencentmaas.com/v1
DEEPSEEK_MODEL    <- deepseek-v4-flash-202605
```

入口不输出映射值，不把 Key 写回环境，也不把旧 DeepSeek Key 传给 TokenHub。

## 数据流

1. 浏览器同源 POST `/api/chat`。
2. Cloudflare Function 读取 TokenHub 专用 Secret，并创建 TokenHub Runtime。
3. Runtime 校验配置、请求上下文和 Upstash 限流。
4. 本地检索器从简历与六份作品知识索引中选择证据。
5. Provider 请求 `https://tokenhub.tencentmaas.com/v1/chat/completions`。
6. TokenHub 流式返回 DeepSeek-V4-Flash 原厂直供结果。
7. Provider 解析 SSE，并由现有协议向浏览器返回 `start`、`delta`、`sources`、`usage` 和 `done`。

## 错误处理与安全

- TokenHub Key 缺失、空白、超过 4,096 字符或含空格、控制字符、非 ASCII 字符时，Runtime 安全关闭。
- Provider URL 不在精确白名单时，Runtime 安全关闭。
- TokenHub HTTP `401` 映射为脱敏 `authentication`。
- HTTP `402` 映射为 `balance`。
- HTTP `429` 映射为 `rate_limited`。
- HTTP `5xx` 映射为可重试 `upstream`。
- Fetch 在收到 HTTP 状态前失败时映射为 `network`。
- 浏览器继续只收到通用 `upstream_unavailable`，不显示 TokenHub 正文、URL、请求头或账户信息。
- 日志只允许固定事件名和固定类别。
- 不自动回退到 Cloudflare Gateway、Vercel、其他模型或后付费路径。

## 测试

### Provider 单元测试

- TokenHub 精确 Base URL 被接受。
- TokenHub 请求使用正确的 `/v1/chat/completions`。
- `authorization` 包含测试 TokenHub Key。
- TokenHub 请求不包含 `cf-aig-authorization`。
- TokenHub 请求体不包含 `user_id`。
- 近似但非精确的 TokenHub URL 全部被拒绝。
- 现有 DeepSeek 官方和 Cloudflare Gateway 双认证测试继续通过。
- TokenHub 流式 `delta`、`usage`、`[DONE]` 继续由现有 SSE 解析测试覆盖。

### Cloudflare 入口测试

- TokenHub Key 存在时不调用 AI binding。
- 创建 Runtime 时使用固定 Base URL、固定模型和 TokenHub Key。
- TokenHub Key 缺失时返回 `chat_disabled`。
- 旧 DeepSeek Key 存在但 TokenHub Key 缺失时仍不能启用 TokenHub 路径。
- 日志不包含任何 Key、URL、Prompt 或上游正文。
- 并发首次请求只初始化一个 Runtime。

### 全量检查

- 所有 Vitest 测试通过。
- TypeScript、Vite、知识库 `sources=8 chunks=139`、作品 `projects=6 pages=135` 和客户端 bundle 边界检查通过。
- `.env.example` 只出现空变量名。
- Git 跟踪文件密钥扫描通过。

## Production 验收

1. 用户通过交互式 Wrangler 命令写入 `TENCENT_TOKENHUB_API_KEY`。
2. Secret 列表只显示名称和 `Value Encrypted`。
3. 部署的 Commit SHA 必须与本地验证和 GitHub 分支一致。
4. Pages Production 分支必须使用项目当前配置的 `feature/portfolio-ai-chat-clean`。
5. 正式域名 `/api/chat` 返回 `text/event-stream`。
6. 真实中文问题至少出现：
   - `start`
   - 一个非空 `delta`
   - `sources`
   - `done`
7. TokenHub 控制台用量增加，且保持后付费关闭。
8. 日志不再记录该请求的 `portfolio_chat_upstream_failure`。

## 发布与回退

发布顺序：

1. 完成 TDD 和全量本地验证。
2. 用户交互式写入 TokenHub Secret。
3. 推送同一提交到 GitHub。
4. 手动部署同一 `dist` 到 Cloudflare Production 分支。
5. 完成真实 SSE、脱敏日志和 TokenHub 用量验收。

若 TokenHub 仍在取得 HTTP 状态前稳定记录 `network`：

- 停止继续更换 Key、扩大权限或启用后付费；
- 保持静态站点和作品页可用；
- 不自动回退到旧 Gateway；
- 返回已经批准的 Vercel Production API 中转设计，或开始腾讯云境内 Serverless/API 部署设计。

若 TokenHub 返回认证、额度或限流类别：

- 不修改代码掩盖错误；
- 仅在腾讯控制台核对 Key 状态、模型访问范围、免费额度和调用限制；
- 真实通过后再删除未使用的 Cloudflare Gateway Secret 和 binding。
