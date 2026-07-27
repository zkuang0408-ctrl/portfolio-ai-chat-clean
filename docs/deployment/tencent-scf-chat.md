# 腾讯云 SCF AI 助手部署手册

本手册把个人网站的 AI 助手部署为腾讯云广州地域的 SCF Web Function。静态网站继续由 Cloudflare Pages 托管，浏览器直接访问腾讯云 Function URL。

部署包由以下命令生成：

```powershell
npm.cmd run scf:build
npm.cmd run scf:verify
```

上传文件位于：

```text
output/portfolio-chat-scf.zip
```

该 ZIP 只包含 `index.mjs` 和可执行的 `scf_bootstrap`，不包含 `.env`、PDF、作品图片或任何真实密钥。

## 1. 创建 SCF Web Function

进入腾讯云 Serverless Cloud Function 控制台，创建函数时使用：

| 配置项 | 值 |
| --- | --- |
| 地域 | 广州 |
| 函数类型 | Web 函数 |
| 运行环境 | Node.js 20.19 |
| 部署方式 | 本地上传 ZIP |
| 内存 | 512 MB |
| 执行超时 | 60 秒 |
| 启动文件 | ZIP 内的 `scf_bootstrap` |
| 监听地址 | 代码固定为 `0.0.0.0:9000` |

上传 `output/portfolio-chat-scf.zip`。不要在控制台在线编辑或把 ZIP 解压后逐文件复制；直接上传能保留启动文件的执行权限。

腾讯云参考：

- <https://cloud.tencent.com/document/product/583/56124>
- <https://cloud.tencent.com/document/product/583/56126>
- <https://cloud.tencent.com/document/product/583/90617>

## 2. 写入服务器环境变量

在函数配置的环境变量页面创建以下名称。

无需保密的值：

| 名称 | 值 |
| --- | --- |
| `CHAT_ENABLED` | `true` |
| `CHAT_ALLOWED_ORIGINS` | `https://portfolio-ai-chat-clean.pages.dev` |
| `CHAT_SITE_DAILY_LIMIT` | `300` |
| `CHAT_VISITOR_DAILY_LIMIT` | `30` |
| `CHAT_VISITOR_MINUTE_LIMIT` | `6` |
| `CHAT_COOLDOWN_SECONDS` | `3` |
| `CHAT_MAX_OUTPUT_TOKENS` | `700` |
| `CHAT_UPSTREAM_TIMEOUT_MS` | `45000` |

需要保密的值：

| 名称 | 来源 |
| --- | --- |
| `TENCENT_TOKENHUB_API_KEY` | 腾讯云 TokenHub API Key 管理页面 |
| `RATE_LIMIT_KV_URL` | Upstash REST URL |
| `RATE_LIMIT_KV_TOKEN` | Upstash REST Token |
| `RATE_LIMIT_SALT` | 之前生成并用于限流的随机盐 |

保密值只在腾讯云控制台内粘贴：

- 不发送到 Codex、聊天软件或邮件。
- 不写入 `.env.example`、GitHub 或 Function URL。
- 不截图包含完整值的页面。
- 不复用已经在聊天中出现过的旧 Key。

## 3. 创建 Function URL

在函数详情的“函数 URL”页面创建公网 URL：

| 配置项 | 值 |
| --- | --- |
| 公网访问 | 开启 |
| 内网访问 | 关闭 |
| 授权类型 | 开放 / `NONE` |
| CORS | 开启 |
| Allowed Origin | `https://portfolio-ai-chat-clean.pages.dev` |
| Allowed Methods | `POST`、`OPTIONS` |
| Allowed Headers | `content-type` |
| Credentials | 关闭 |
| Max Age | `600` |

不要把 Origin 配置为 `*`。浏览器访客无法安全保存 CAM 签名密钥，因此 Function URL 使用匿名开放调用，安全边界由精确 Origin、请求校验、每访客限流和全站限流共同组成。

创建后复制控制台显示的 HTTPS Function URL。控制台 URL 是固定端点，聊天接口是在它后面追加 `/chat`。

腾讯云参考：

- <https://cloud.tencent.com/document/product/583/96099>
- <https://cloud.tencent.com/document/product/583/100227>
- <https://cloud.tencent.com/document/product/583/96100>

## 4. 在切换网站前测试 Function URL

在 PowerShell 中交互式粘贴公开 URL。该 URL 不是密钥，但不要把 TokenHub Key 放入命令。

```powershell
$base = (Read-Host "粘贴腾讯云控制台显示的 Function URL").Trim().TrimEnd("/")
$env:SCF_CHAT_URL = "$base/chat"
```

### CORS 预检

```powershell
curl.exe -i -X OPTIONS $env:SCF_CHAT_URL `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: content-type"
```

必须看到：

```text
HTTP 204
Access-Control-Allow-Origin: https://portfolio-ai-chat-clean.pages.dev
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: content-type
```

### 拒绝陌生 Origin

```powershell
curl.exe -i -X POST $env:SCF_CHAT_URL `
  -H "Origin: https://attacker.example" `
  -H "Content-Type: application/json" `
  --data-raw '{"message":"test","history":[],"sessionId":"session_123","locale":"en"}'
```

必须返回 HTTP 403，且响应中不得出现 `Access-Control-Allow-Origin: https://attacker.example`。

### 真实 SSE 回答

```powershell
curl.exe -N -i -X POST $env:SCF_CHAT_URL `
  -H "Origin: https://portfolio-ai-chat-clean.pages.dev" `
  -H "Accept: text/event-stream" `
  -H "Content-Type: application/json" `
  --data-raw '{"message":"请用一分钟介绍赵实旷","history":[],"sessionId":"session_123","locale":"zh"}'
```

不要手工添加 `x-scf-remote-addr`；该头必须由腾讯 Function URL 前置代理注入。

成功响应必须包含：

```text
HTTP 200
Content-Type: text/event-stream
event: start
event: delta
event: sources
event: done
```

至少一个 `delta` 的 `text` 必须非空。TokenHub 控制台的用量应增加，SCF 日志不得出现问题正文、访客 IP、Key 或上游响应正文。

## 5. 让 Cloudflare 首页使用 SCF

只有 Function URL 上述测试全部通过后，才切换首页。

进入 Cloudflare Pages 项目 `portfolio-ai-chat-clean` 的 Production 环境变量，创建：

```text
VITE_CHAT_API_URL
```

值填写已经验证的完整 `$env:SCF_CHAT_URL`，必须：

- 使用 `https://`；
- 主机以 `.ap-guangzhou.tencentscf.com` 结尾；
- 路径严格为 `/chat`；
- 不带尾部 `/`、查询参数、片段或用户名密码。

该变量是公开的构建配置，不是密钥。保存后重新部署与 GitHub 已验证 Commit 相同的 Production 构建。

## 6. 正式网站验收

打开：

```text
https://portfolio-ai-chat-clean.pages.dev
```

依次确认：

1. 中文推荐问题可以逐段显示回答。
2. 英文问题自动得到英文回答。
3. 回答后出现作品或简历来源按钮。
4. 点击来源能进入正确作品和页码。
5. Network 中聊天请求目标是腾讯 Function URL。
6. 响应 `content-type` 是 `text/event-stream`。
7. 每访客每日 30 次、每分钟 6 次、3 秒冷却和全站每日 300 次仍生效。
8. 作品分页图片的加载速度没有被聊天 API 影响。
9. SCF 日志只有固定事件、错误类别和耗时，不含敏感正文。

## 7. 回退

如果 SCF 真实回答、CORS 或限流验收失败：

1. 从 Cloudflare Production 删除 `VITE_CHAT_API_URL`。
2. 重新部署相同静态站点 Commit。
3. 浏览器将自动回退同源 `/api/chat`。
4. 保留 SCF 环境变量、Upstash 数据和 TokenHub 设置，避免破坏诊断证据。
5. 不把 CORS 放宽为 `*`，不关闭限流，不开启 TokenHub 后付费来掩盖网络或代码错误。

回退不会影响静态首页、作品图片、PDF 或作品导航。

## 8. 后续绑定域名

Function URL 稳定后，再单独处理腾讯云 API 网关或自定义域名。若使用中国大陆地域的自定义域名，需要先完成 ICP 备案、HTTPS 证书和 DNS 切换设计；这些操作不包含在本次发布中。
