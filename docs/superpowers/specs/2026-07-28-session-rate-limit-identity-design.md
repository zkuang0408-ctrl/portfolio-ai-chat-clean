# 基于匿名会话的访客限流身份设计

## 背景

腾讯云 SCF 线上安全诊断事件已确认聊天请求在 `visitor_identity` 阶段失败。当前实现要求 Web Function 提供 `x-scf-remote-addr`，但实际函数 URL 请求没有向 Node Web Server 提供该头。腾讯 Web Function 公共请求头文档也未将访客地址列为保证字段，因此不能继续把它作为生产依赖。

## 目标

在不依赖或记录访客 IP 的前提下，为正常作品集访客提供稳定的匿名限流身份，使聊天请求可以继续进入 Upstash、知识检索和 TokenHub，同时维持现有费用保护上限。

## 身份来源

前端已经为每个浏览器生成符合以下约束的 `sessionId`，保存在浏览器本地存储并随聊天请求发送：

- 仅允许字母、数字、下划线和连字符。
- 长度为 8–128 个字符。
- 服务端在进行任何限流操作前完成结构和格式校验。

服务端使用已验证的 `sessionId` 作为身份原料，并增加固定域分隔前缀：

```text
session:<validated-session-id>
```

该原料与 `RATE_LIMIT_SALT` 一起传入现有匿名键派生函数。Upstash 只接收派生后的不可逆匿名键，不接收原始 `sessionId`。

## 限流规则

现有限流参数保持不变：

- 同一匿名访客两次请求间隔至少 3 秒。
- 同一匿名访客每分钟最多 6 次。
- 同一匿名访客每天最多 30 次。
- 全站每天最多 300 次。

清除浏览器本地数据、使用无痕窗口或更换浏览器会产生新的匿名访客身份，因此访客级限制不是强身份认证。全站每日 300 次上限仍作为不可绕过的费用保护边界。该权衡适合公开的个人作品集助手，不引入登录、验证码或设备指纹。

## 数据流

1. 浏览器读取或生成本地 `sessionId`。
2. 浏览器发送经过现有 JSON 结构约束的聊天请求。
3. 服务端验证来源、内容类型、请求体和 `sessionId`。
4. 服务端从已验证的 `sessionId` 派生匿名访客键。
5. Upstash 使用匿名访客键执行冷却、分钟、访客日和全站日限制。
6. 通过限流后执行本地知识检索并调用 TokenHub。

## 代码边界

- `handleChat` 不再调用部署环境提供的 `ipAddress` 回调。
- `ChatHandlerDependencies`、`RuntimeOptions` 和 SCF 适配层移除不再使用的 IP 获取依赖。
- `deriveVisitorKey` 保持为通用匿名键派生函数，只更换输入原料。
- SCF 的安全运行阶段日志保留；匿名键派生异常仍归类为 `visitor_identity`。
- `scfRemoteAddress` 若无其他调用方则连同对应测试删除，避免留下误导性的生产契约。

## 隐私与安全

以下内容不得进入日志、Upstash 键名或公开响应：

- 原始 `sessionId`。
- 访客 IP 或代理请求头值。
- `RATE_LIMIT_SALT`。
- API Key、Upstash Token、问题内容和历史对话。

诊断日志继续只允许固定事件名、失败阶段和腾讯请求 ID。现有来源白名单、请求大小限制、严格 JSON 校验、TokenHub 服务端密钥边界和全站每日上限保持不变。

## 兼容性

- 已有访客在下一次请求时会使用新的匿名键空间，访客级计数从零开始一次。
- 全站每日计数键保持不变，不会因身份来源变化而重置。
- Vercel、Cloudflare 和本地运行时不再需要提供 IP 回调。
- 网页 UI、SSE 事件格式、推荐问题、引用来源和错误文案不变。

## 测试

测试驱动实现必须覆盖：

1. 请求没有任何访客 IP 头时仍能通过身份阶段并调用 Upstash。
2. 同一 `sessionId` 派生相同匿名键。
3. 不同 `sessionId` 派生不同匿名键。
4. 派生原料带有 `session:` 域分隔前缀。
5. 无效 `sessionId` 在限流前被拒绝。
6. 运行诊断、指标和 Upstash 调用不包含原始 `sessionId`。
7. SCF 运行时不再注入 `ipAddress`。
8. 原有单元测试、TypeScript、生产构建、客户端密钥边界、知识库、作品页和 SCF ZIP 校验全部通过。

## 上线验收

覆盖部署新 ZIP 后，从正式 Cloudflare Pages 来源请求聊天接口。验收依次要求：

1. 不再出现 `visitor_identity` 运行故障。
2. 请求能够进入 Upstash。
3. TokenHub 正常返回时，接口响应为 HTTP 200 和 `text/event-stream`。
4. 事件流包含 `start`、`delta`、`sources` 和 `done`。
5. 首页 AI 对话框能够显示回答与依据来源。
