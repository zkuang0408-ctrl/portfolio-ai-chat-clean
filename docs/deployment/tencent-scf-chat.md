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

## 更新已上线的结构化作品知识库运行时

本次作品知识库或检索逻辑更新时，不需要新建函数，也不要在线编辑代码。请在已有的
`portfolio-ai-chat` 函数中直接上传新生成的 `output/portfolio-chat-scf.zip`，并按以下顺序操作：

1. 保持现有环境变量完全不变，尤其不要改动 TokenHub、Upstash 和限流盐。
2. 上传新的 ZIP 后，发布一个新的函数版本；确认新版本已指向该上传包。
3. 从 `https://portfolio-ai-chat-clean.pages.dev` 发送一次 `OPTIONS` 预检请求，确认精确 Origin
   仍得到允许，而不是把 CORS 放宽为 `*`。
4. 在生产站点逐一询问以下问题，确认回答直接、可引用，且作品来源可导航：

   ```text
   INKSeat是什么作品？
   INKSeat的系统架构是什么？
   EMOVUE如何自动捕捉情绪瞬间？
   UroSense解决了什么问题？
   哪个项目最能体现赵实旷的系统思考？
   ```

5. 只在 SCF 日志中检查失败事件、状态码和耗时。不要记录、复制或传播作品知识库正文、
   访客问题、回答内容或任何密钥。

验证完成前不要修改 Cloudflare Pages 的公开聊天地址；该步骤只更新腾讯云函数运行时。

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

## 9. 结构化 RAG 发布记录

发布时间：`2026-07-29 19:38:35 +08:00`

| 项目 | 发布证据 |
| --- | --- |
| Git 提交 | `7a29b74`（部署包提交：`82b467d`） |
| SCF 函数 | `portfolio-ai-chat` |
| SCF 数字版本 | `1` |
| 发布时默认流量 | `$LATEST` 100% |
| SCF 包 SHA-256 | `23E22F8A7418C34654600DC687E390655E5ACB95183800FB1AF335682907E499` |
| 正式站点 | `https://portfolio-ai-chat-clean.pages.dev` |
| Function URL | `https://1458594587-86tdgscaev.ap-guangzhou.tencentscf.com/chat` |

生产验收结果：

| 问题 | 结果 |
| --- | --- |
| `INKSeat是什么作品？` | 通过。第一句直接说明这是面向窄体机经济舱的电子纸显示系统；来源为 INKSeat 第 1、8、7 页。 |
| `INKSeat的系统架构是什么？` | 通过。说明智能推送后台、乘客数据、航空公司内容、座椅终端及全航程蓝图；来源为第 8、17 页。 |
| `EMOVUE如何自动捕捉情绪瞬间？` | 通过。说明心率、皮肤电、体温、可调阈值及 Arduino 原型触发流程；来源为第 8、15、1 页。 |
| `UroSense解决了什么问题？` | 通过。说明病房尿量记录中的兼顾困难、漏测漏记、无效数据与转移清洁负担；来源为第 6、1 页。 |
| `哪个项目最能体现赵实旷的系统思考？` | 通过。无历史会话下直接选择 INKSeat，并说明多角色、多阶段系统架构；来源为第 8、17 页。 |

附加验证：

- Function URL 的 CORS 预检返回 HTTP 204，Origin、Methods、Headers 和 Max-Age 均符合配置。
- 直接 POST 返回 HTTP 200 和 `text/event-stream`，事件顺序为 `start → delta → sources → done`。
- 正式站点五次请求均返回 HTTP 200，无 CORS、限流或上游错误，浏览器控制台无错误。
- 点击 `INKSeat · p. 8` 后，首页作品查看器正确切换到 `08 / 18`。
- 聊天面板位置、内部滚动和作品分页交互保持不变。
- 连续历史对比较题的措辞可能产生影响；生产验收按无历史独立会话执行。
