# MagicPush 审查问题优化实施报告

> 日期：2026-08-12
> 基线：`feat/misound-playback-enhance` / `8905e98`
> 依据：`2026-08-02-independent-project-review-and-verdict.md`

## 结论

审查中影响当前版本合入的 P0 项和主要 P1 项已经完成整改，并通过后端、前端、静态检查和生产构建验证。当前代码已从“存在明确发布阻断”推进到“可以进入人工验收与预发布验证”的状态。

## 已完成整改

### 多租户与权限边界

- Endpoint 全量换绑改为事务操作，换绑前一次性校验所有渠道都属于当前用户；非法输入不会破坏原绑定。
- Endpoint 对外响应只返回渠道摘要，不再返回 `config`，避免第三方 token、密码或 Header 泄露。
- QQBot、元宝 Bot、ClawBot 专用控制接口统一校验渠道归属。
- 增加真实 SQLite 跨用户绑定与事务回滚集成测试。

### MiSound 播放链路

- 旧版顶层 `volume / audioUrl / playCount / playInterval` 自动归一到 `extraData.misound`，完整透传到适配器。
- 空内容只允许发送到纯 MiSound 目标，且必须提供有效的 HTTP(S) 音频地址。
- 完整播放任务进入进程级串行队列，避免开始音量、播放、间隔和结束音量交错。
- 总计划等待预算限制为 60 秒；认证重试只允许发生在第一项播放副作用之前。
- 针对 `xiaoii` 的进程级单例，当前采用“单实例单小米账号”的安全约束；同账号可配置多个设备。
- 新增覆盖参数、串行执行、等待预算和认证重试测试。

### SSRF 与敏感日志

- 新增统一安全 URL 解析：仅允许 HTTP(S)，拒绝凭据 URL，解析全部 DNS 结果并阻止回环、私网、链路本地、组播和保留地址。
- 请求阶段固定使用已校验 DNS 地址，禁用重定向并限制响应体，降低 DNS rebinding 和重定向绕过风险。
- 已覆盖 Webhook、Gotify、Bark、ntfy、WechatClawBot、Synology Chat、PushDeer、iGot、PushMe、ShowDoc，以及企业微信远程媒体下载。
- 默认禁止访问私网；可信单管理员局域网部署可由运维显式设置 `ALLOW_PRIVATE_OUTBOUND_URLS=true`。
- 请求日志和 Inbound 日志不再记录 push/inbound token。

### 凭证生命周期

- 新 refresh token 仅保存 SHA-256 摘要；查询和删除兼容历史明文记录，旧令牌会在轮换时自然迁移。
- 前端登出会调用服务端撤销 refresh token，同时保证本地会话立即清理。
- 拒绝公开的 `JWT_SECRET` 占位值；示例配置默认留空，由服务端安全生成并持久化。
- 自定义 endpoint token 最小长度提高到 24，前端随机生成改用 Web Crypto；服务端自动 token 仍使用安全随机值。

### 工程与前端稳健性

- 后端测试脚本改为 Node Test Runner 默认发现规则。
- Inbound 静态测试路由移到参数路由之前，并统一专用限流。
- 修正分离部署 Docker build context；Dockerfile 中 pnpm 固定为 `10.33.4`。
- CI 增加前端 production build、Compose 校验、全量镜像和分离镜像构建。
- MiSound 扫码弹窗会清理全部计时器；日志页可容忍非 JSON 响应；主题监听改用 store effect scope 清理。
- 前端生产包按 Vue、Element Plus、图标和通用依赖拆分，主业务入口不再是单个约 1.22 MB 的 chunk。

## 验证结果

| 检查 | 结果 |
|---|---|
| 后端全量测试（Node 22 兼容运行时） | 296 项：294 通过，0 失败，2 跳过 |
| 前端测试 | 19/19 通过 |
| 全仓 ESLint | 通过 |
| `git diff --check` | 通过 |
| 前端 production build | 通过 |
| 本地 Docker build | 当前机器没有 Docker CLI；已加入 CI 构建门禁 |

本机默认 Node 24 与项目现有 `better-sqlite3 9.6` 原生绑定不兼容；测试使用与项目声明兼容、且接近 CI/Docker Node 20 的 Node 22 运行时完成。这是本地工具链问题，不是测试失败。

## 保留的长期架构项

以下项目不再阻断本轮合入，但需要独立设计和迁移方案：

1. 若要在同一服务进程支持多个小米账号，应改为按账号隔离的 worker/process，而不是取消当前单账号保护。
2. 渠道第三方凭证的数据库加密需要独立密钥管理、轮换和历史数据迁移方案，不宜用与数据库同存的密钥做表面加密。
3. HttpOnly refresh cookie + 内存 access token 会改变认证协议与跨域部署方式，建议作为单独版本实施。
4. Element Plus 依赖包仍约 756 KB；当前已完成缓存友好的拆包，更深的体积下降需要组件级按需引入改造。
