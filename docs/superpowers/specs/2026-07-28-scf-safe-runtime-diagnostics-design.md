# 腾讯云 SCF 安全运行阶段诊断设计

## 背景

线上腾讯云 Web 函数已能通过 CORS 预检并接收 `POST /chat`，SCF 平台日志显示函数正常执行，但应用在约 49ms 内返回 `500 internal_error`。现有日志仅包含平台的 `START / Response / END / Report`，无法区分失败发生在访客身份识别、Upstash 限流还是本地检索阶段。

## 目标

在不改变网页界面、聊天协议、限流规则和正常回答流程的前提下，为进入 SSE 响应前的内部异常记录安全、可检索的阶段信息，以便定位线上故障。

## 方案选择

采用分阶段结构化诊断日志，而不是逐项猜测配置或临时绕过限流。

不采用以下方案：

- 逐项替换 Upstash 配置：无法证明腾讯云实际收到的请求头和运行状态，定位不可靠。
- 临时绕过限流：会削弱公开接口保护，并改变生产行为。
- 记录完整异常对象：第三方 SDK 异常可能包含请求细节，不满足隐私约束。

## 诊断边界

聊天处理器在以下阶段维护一个内部阶段标识：

- `request_validation`：请求方法、来源、内容类型、请求体和字段校验。
- `visitor_identity`：读取腾讯云注入的访客地址并生成匿名访客键。
- `rate_limit`：调用 Upstash 执行频率与每日额度检查。
- `retrieval`：在本地知识索引中检索回答依据。

只有非预期异常会触发运行诊断。正常的请求校验错误、限流响应和上游模型错误继续沿用现有公开错误码与日志，不重复记录为运行故障。

## 日志格式

SCF 运行时通过现有依赖注入边界输出单行 JSON：

```json
{
  "event": "portfolio_chat_runtime_failure",
  "stage": "rate_limit",
  "requestId": "腾讯云请求 ID"
}
```

允许记录的字段只有：

- 固定事件名。
- 枚举化的失败阶段。
- 腾讯云生成的请求 ID。

严禁记录：

- API Key、Upstash Token、Salt 或任何环境变量值。
- 访客 IP、匿名访客键或会话 ID。
- 用户问题、历史对话、检索结果或模型回答。
- 原始异常消息、堆栈或第三方响应正文。

诊断回调自身发生异常时必须被吞掉，不能改变访客收到的响应。

## 代码边界

- 共享聊天处理器负责确定失败阶段，但不直接依赖 `console` 或腾讯云。
- 运行时依赖增加一个默认空实现的诊断回调，确保 Vercel、Cloudflare 和测试环境行为保持不变。
- 腾讯云 SCF 适配层实现该回调，并从请求头读取平台生成的 `x-scf-request-id`。
- 现有 `portfolio_chat_configuration_failure` 与 `portfolio_chat_upstream_failure` 事件保持不变。

## 错误处理

- 公开响应继续使用现有通用错误：`500 internal_error`。
- 日志只用于服务端诊断，不向浏览器增加内部字段。
- SSE 已开始后发生的模型错误继续使用现有 `upstream_unavailable` 流事件。
- 诊断逻辑不得延迟、重试或改变任何外部调用。

## 测试

测试驱动实现需要覆盖：

1. 访客地址缺失时记录 `visitor_identity`，并保持原有 `500 internal_error`。
2. Upstash 调用抛错时记录 `rate_limit`。
3. 本地检索抛错时记录 `retrieval`。
4. 请求校验错误不记录运行故障。
5. 诊断回调抛错不改变公开响应。
6. SCF 日志对象仅包含 `event`、`stage`、`requestId`，不包含敏感输入。
7. 原有测试、TypeScript 检查、客户端密钥边界检查和 SCF ZIP 校验全部通过。

## 交付与验收

实现后重新生成 `output/portfolio-chat-scf.zip`。用户在腾讯云函数代码页面覆盖上传 ZIP，保持现有环境变量和函数 URL 不变。重新触发一次公开请求后，在 CLS 搜索 `portfolio_chat_runtime_failure`，根据 `stage` 定位根因并进行下一步修复。
