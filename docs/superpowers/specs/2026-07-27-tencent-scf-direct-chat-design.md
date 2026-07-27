# 腾讯云 SCF 直连 AI 助手设计

## 目标

把首页 AI 助手的服务端执行环境从 Cloudflare Pages Function 迁移到腾讯云广州地域的 SCF Web Function。浏览器通过腾讯云 Function URL 直接请求聊天服务，绕开已确认失败的 Cloudflare 到腾讯 TokenHub 网络路径，同时保留现有首页交互、作品知识库、基于证据的回答、SSE 流式输出、来源跳转和 Upstash 限流。

本次只迁移聊天 API。静态网站、高清作品分页图片和 Cloudflare Pages 部署保持不变。自定义域名、ICP备案和整站迁入中国大陆云服务不属于本次范围。

## 当前证据

- Cloudflare Pages 静态网站和作品集正常。
- 当前生产请求已经进入 Provider 阶段，但 Cloudflare Function 请求腾讯 TokenHub 时只返回脱敏 `upstream_unavailable`，没有获得可用的流式正文。
- 同一 TokenHub Key、模型和接口从用户电脑直连返回 HTTP 200，说明凭据、模型权限和接口参数有效；故障集中在 Cloudflare 到腾讯 TokenHub 的运行链路。
- 现有代码已经把知识检索、Prompt、TokenHub Provider、SSE、Upstash 限流和 HTTP 入口分开，迁移无需重写回答逻辑。
- 腾讯云官方文档说明：
  - Web Function 可直接处理原生 HTTP 请求，并监听 `0.0.0.0:9000`。
  - Web Function 默认支持 SSE，不需要额外开启协议。
  - Function URL 提供固定的公网 HTTPS 端点，并可配置 CORS。
  - Function URL 的开放授权允许浏览器匿名访问，因此应用自身仍需执行请求校验和限流。

参考：

- <https://cloud.tencent.com/document/product/583/56124>
- <https://cloud.tencent.com/document/product/583/90617>
- <https://cloud.tencent.com/document/product/583/96099>
- <https://cloud.tencent.com/document/product/583/100227>

## 方案比较

### A. SCF Web Function + Function URL 直连（采用）

浏览器跨域 POST 到腾讯云 Function URL。SCF 直接调用同地域可访问的 TokenHub，并把现有 SSE 协议流式返回浏览器。

优点：

- 移除 Cloudflare 服务端中转，直接解决当前故障链路。
- 腾讯云原生支持 Web Function、SSE 和公网 Function URL。
- 只新增薄适配层，可复用已测试的业务代码。
- 后续可在不改业务协议的前提下绑定已备案域名或迁入腾讯 API 网关。

代价：

- 浏览器会看到公开的 Function URL；它不是秘密。
- 必须正确配置 CORS、请求校验、访客身份提取和 Upstash 限流。
- 静态站点与 API 分属两个域名。

### B. Cloudflare Function 转发到 SCF

浏览器继续同源请求 `/api/chat`，Cloudflare 再代理到 SCF。

该方案减少前端改动，但仍把 Cloudflare 保留在实时请求链路中，增加故障点和跨境跳转，也不符合优先改善中国大陆访问的目标，因此不采用。

### C. 整站迁入腾讯云

把静态站点、作品资源和聊天 API 一起迁移到腾讯云。

该方案长期可获得更完整的大陆托管路径，但涉及静态资源发布、CDN、域名、HTTPS、备案与回滚体系，范围明显超出本次 AI 助手恢复任务，因此另行设计。

## 目标架构

```text
Cloudflare Pages 静态首页
        |
        | HTTPS POST /chat + SSE
        v
腾讯云 SCF Web Function（广州，Node.js 20）
        |                    |
        |                    +--> Upstash Redis（限流）
        |
        +--> 腾讯云 TokenHub / DeepSeek-V4-Flash
```

SCF 使用标准 Node.js HTTP Server，监听 `0.0.0.0:9000`。HTTP 适配层把 Node 请求转换为 Web `Request`，交给现有 `createRuntime().handle()`；再把 Web `Response` 的状态、响应头和 `ReadableStream` 写回 Node 响应。共享 Runtime 继续负责全部业务规则。

## 组件边界

### 1. SCF 启动入口

独立入口只负责：

- 读取 SCF 环境变量。
- 初始化一次共享 Runtime。
- 启动 `0.0.0.0:9000` HTTP Server。
- 处理 `POST /chat` 和 `OPTIONS /chat`。
- 拒绝其他路径和方法。
- 把腾讯代理提供的可信客户端地址交给共享 Runtime。
- 记录脱敏的请求 ID、结果类别和耗时。

入口不负责知识检索、Prompt、Provider 协议或限流算法。

### 2. Node 与 Web API 适配器

适配器是可单元测试的独立模块，负责：

- 使用原始请求方法、URL、请求头和 body 创建 Web `Request`。
- 在浏览器断开时中止上游 Web 请求。
- 把 Web `Response` 状态和允许的响应头复制到 Node 响应。
- 丢弃 `connection`、`transfer-encoding` 等逐跳响应头，由 SCF 网关管理连接和分块传输。
- 使用流管道传输 SSE，不把完整回答缓存在内存。
- 在响应尚未开始时把内部适配错误转换为通用 JSON 500。
- 在 SSE 已开始后发生连接错误时终止连接，不追加非协议正文。

### 3. SCF Runtime 配置

SCF 环境变量映射为现有 Runtime 接口：

```text
TENCENT_TOKENHUB_API_KEY  -> DEEPSEEK_API_KEY
固定 TokenHub Base URL    -> DEEPSEEK_BASE_URL
固定 TokenHub 模型 ID     -> DEEPSEEK_MODEL
```

固定值：

```text
Base URL: https://tokenhub.tencentmaas.com/v1
Model:    deepseek-v4-flash-202605
```

共享变量保持现状：

```text
CHAT_ENABLED
RATE_LIMIT_KV_URL
RATE_LIMIT_KV_TOKEN
RATE_LIMIT_SALT
CHAT_SITE_DAILY_LIMIT
CHAT_VISITOR_DAILY_LIMIT
CHAT_VISITOR_MINUTE_LIMIT
CHAT_COOLDOWN_SECONDS
CHAT_MAX_OUTPUT_TOKENS
CHAT_UPSTREAM_TIMEOUT_MS
```

缺少或非法的必需变量时，Runtime 安全关闭并返回现有 `chat_disabled`，不得尝试其他 Key、模型、后付费路径或 Cloudflare Gateway。

### 4. 浏览器聊天端点配置

构建时公开一个非敏感变量：

```text
VITE_CHAT_API_URL
```

规则：

- 变量为空时使用现有相对地址 `/api/chat`，保证本地开发和旧部署兼容。
- 变量存在时必须是 HTTPS 绝对地址，主机严格匹配腾讯广州 Function URL
  `<app-id>-<url-id>.ap-guangzhou.tencentscf.com`，路径严格为 `/chat`，不允许端口、用户名、密码、查询参数或片段。
- 生产值指向腾讯 Function URL 的 `/chat`。
- 无效值在构建或初始化时安全回退 `/api/chat`，不得产生任意请求目的地。

聊天控制器不再硬编码 `/api/chat`，而是通过依赖接收已校验的 endpoint。消息格式、历史记录、语言、SSE 解析和 UI 文案保持不变。

## 请求与响应流程

1. 访客在首页提交问题。
2. 浏览器向 `VITE_CHAT_API_URL` 发送 JSON POST，并携带浏览器自动生成的 `Origin`。
3. 腾讯 Function URL 完成 CORS 处理并把原生 HTTP 请求交给 Web Function。
4. SCF 入口再次校验路径、方法和 Origin。
5. Runtime 校验 JSON、消息长度、语言、会话 ID 和历史记录。
6. SCF 从腾讯代理可信请求头中提取客户端 IP，使用现有 HMAC 盐生成不可逆访客键。
7. Upstash 原子检查冷却、每分钟、每访客每日和全站每日限制。
8. 本地知识库检索简历和六份作品的相关证据。
9. TokenHub Provider 发起流式 Chat Completions 请求。
10. SCF 按现有协议返回 `start`、`delta`、`sources`、可选用量和 `done`。
11. 浏览器逐段渲染回答，并保留来源跳转。

## CORS 与公开端点安全

Function URL 使用开放授权，因为匿名访客无法安全持有 CAM 调用凭据。开放授权不等于无保护；以下应用规则构成安全边界：

- Function URL 控制台 CORS 只允许：
  - `https://portfolio-ai-chat-clean.pages.dev`
  - 后续正式域名不在本次允许列表中；接入时单独修改并验证
- 只允许 `POST`、`OPTIONS` 和 `content-type` 请求头。
- 不启用 credentials，不使用 Cookie，不返回 `Access-Control-Allow-Credentials`。
- 应用入口对 `Origin` 使用同一精确允许列表；缺失或不匹配时拒绝。
- SCF 使用 `CHAT_ALLOWED_ORIGINS` 保存逗号分隔的 HTTPS Origin；首发值严格为
  `https://portfolio-ai-chat-clean.pages.dev`，解析失败、包含路径或包含通配符时安全关闭聊天。
- CORS 不是防止脚本或命令行滥用的认证机制；Upstash 全站与访客限流仍然必须启用。
- TokenHub Key、Upstash Token 和盐只存在于 SCF 加密环境配置及进程内存。
- Function URL 可以公开，任何密钥不得进入 URL、HTML、JavaScript bundle、Git 或日志。

## 访客身份与限流

默认策略保持：

```text
冷却时间：          3 秒
每位访客每分钟：    6 次
每位访客每日：      30 次
全站每日：          300 次
每日边界：          Asia/Shanghai
```

SCF 入口只信任腾讯 Function URL 注入的 `x-scf-remote-addr` 客户端地址头。解析器必须：

- 接受合法 IPv4 或 IPv6。
- 拒绝空值、控制字符、端口拼接和超长值。
- 该头必须只包含一个地址；出现逗号链时拒绝，不读取浏览器可直接设置的 `x-forwarded-for` 或其他自定义地址头。
- 无法得到合法客户端地址时返回通用 500，不降级为共享访客键。

原始 IP 不写入日志或 Redis；只有加入服务器端盐后的 HMAC-SHA256 访客键进入限流键。

## 错误处理与可观察性

公开响应保持现有协议：

- 配置缺失：`chat_disabled`
- 请求非法或 Origin 不允许：现有对应 4xx 错误
- 达到限制：`rate_limited` 和 `retry-after`
- TokenHub、Upstash 或内部错误：脱敏通用错误
- SSE 已开始后的 Provider 失败：`error` 事件后关闭

日志只记录：

```text
event
requestId
statusCategory
latencyMs
```

日志不得记录：

- TokenHub 或 Upstash 凭据
- 请求头完整内容
- IP 或访客 HMAC
- 访客问题、历史、Prompt、模型正文
- 上游错误正文或完整 URL

SCF 执行超时设置为 60 秒，应用 TokenHub 超时保持 45 秒，使应用能够在平台强制终止前返回协议内错误。

## 部署产物

仓库生成一个可重复构建的 SCF ZIP，包含：

- 编译后的 Node HTTP 入口与共享聊天代码。
- 生成后的知识索引。
- 必需的生产依赖。
- 可执行 `scf_bootstrap`，启动 Node 服务并监听 9000。

ZIP 不包含：

- `.env.local`
- `.git`、测试结果或源码缓存
- 任意真实 Secret
- 静态作品图片和 PDF；聊天服务只需要知识索引，不提供作品文件

构建脚本先生成临时目录，再进行确定性检查和打包。临时产物保持 Git 忽略。

## 测试设计

### SCF 入口和适配器

- `OPTIONS /chat` 对允许 Origin 返回精确 CORS 头。
- 不允许的 Origin、路径和方法被拒绝。
- `POST /chat` 的 JSON body、headers 和 abort signal 正确转换。
- Web JSON 响应状态和头正确写回 Node。
- Web SSE 流按 chunk 输出，没有整段缓冲。
- 客户端断开会中止 Runtime 请求。
- 流开始前和开始后的错误使用不同的安全处理。

### 配置与安全

- 合法 Function URL 被前端接受。
- HTTP、相似域、凭据、查询参数和片段被拒绝或安全回退。
- TokenHub Key 只映射到固定 TokenHub 地址和固定模型。
- 缺少 Key、Upstash 或盐时聊天安全关闭。
- SCF 日志不包含 Key、Token、IP、Prompt 或上游正文。
- 客户端 bundle 不包含任何服务器 Secret。

### 访客地址

- 合法 IPv4、压缩 IPv6 和完整 IPv6 被接受。
- 空值、端口、控制字符、过长值和无效地址被拒绝。
- 限流仍使用不可逆 HMAC 键。

### 回归与端到端

- 全部 Vitest 测试通过。
- TypeScript、Vite、知识索引、作品页资源和客户端 bundle 检查通过。
- 本地启动 SCF 入口后，真实 HTTP POST 返回合法 SSE 序列。
- 浏览器端跨域预检和流式解析测试通过。
- 构建 ZIP 内容清单与 Secret 扫描通过。

## 发布步骤与验收

1. 完成 TDD、全量测试、构建和密钥扫描。
2. 创建腾讯云广州地域 Node.js 20 Web Function，内存从 512 MB 起，超时 60 秒。
3. 在 SCF 控制台写入环境变量；真实值不得发到聊天。
4. 上传构建 ZIP，并确认 `scf_bootstrap` 可启动 9000 端口。
5. 创建公网 Function URL，开放授权，配置精确 CORS。
6. 使用 curl 验证预检、拒绝规则和真实 SSE。
7. 在 Cloudflare Pages 设置 `VITE_CHAT_API_URL` 后重新构建生产站。
8. 从正式首页验证中文和英文问题均产生非空 `delta`、`sources` 和 `done`。
9. 验证每访客 30 次与全站每日限制仍生效。
10. 检查 SCF 日志无敏感信息，并检查 TokenHub 用量增加。

完成标准：

- 中国大陆普通网络可打开静态站点并获得 AI 流式回答。
- AI 回答继续只依据简历和作品知识库，并展示来源。
- Function URL、TokenHub、Upstash 任一失败时，页面显示现有可重试提示，不破坏作品浏览。
- 生产 bundle、Git 历史、日志和公开响应均不包含 Secret。

## 发布与回退

前端 endpoint 是唯一切换点：

- SCF 验收成功：Cloudflare Production 设置 `VITE_CHAT_API_URL` 为 Function URL。
- SCF 出现严重故障：移除该变量并重新部署，前端回退 `/api/chat`；静态站和作品页继续可用。
- 回退不删除 SCF Secret、Upstash 数据或旧 Cloudflare 配置，避免在故障处理时做不可逆操作。

自定义域名与 API 网关延后到 Function URL 稳定后。若以后使用中国大陆自定义域名，则单独完成 ICP 备案、HTTPS 证书和 DNS 切换设计。
