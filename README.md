<div align="center">
  <img src="public/logo.png" alt="测试logo" width="256px">
  <h1 align="center">魔法推送</h1> 
  <span>
    <a href="https://www.160621.xyz/magicpush" target="_blank">官方网站</a> |
    <a href="https://www.160621.xyz/magicpush/guide/dev/overview.html" target="_blank">开发文档</a> |
    <a href="https://github.com/HuFakai/magicpush" target="_blank">项目地址</a> |
    <a href="docs/CHANGELOG.md">更新日志</a>
  </span>
  <p>一个支持多种消息渠道的推送服务管理平台，用户可以通过标准化的REST API接口将消息推送到多种通知渠道。</p>
  <p>
    <a href="./LICENSE">
      <img alt="MIT License"
        src="https://img.shields.io/github/license/HuFakai/magicpush">
    </a>
    <a href="https://www.160621.xyz/magicpush-dev/guide/changelog.html" target="_blank">
      <img alt="Latest Version"
        src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FHuFakai%2Fmagicpush%2Frefs%2Fheads%2Fmain%2Fversion.json&query=%24.version&prefix=v&style=flat&label=version&labelColor=orange">
    </a>
  </p>
</div>

## 交流&打赏

<table>
  <tr>
    <td align="center">
      <a href="https://qm.qq.com/q/wWS78gByRa">点此加入QQ群</a>
      <br>
      <img src="./public/image/qq-group.jpg" alt="qq-group" height="256px">
    </td>
    <td align="center">
      <a href="https://pd.qq.com/s/eveskv89x">点此加入QQ频道</a>
      <br>
      <img src="./public/image/qq-channel.jpg" alt="qq-channel" height="256px">
    </td>
    <td align="center">
      <a href="https://pd.qq.com/s/eveskv89x">支付宝</a>
      <br>
      <img src="./public/image/alipay.png" alt="qq-channel" height="256px">
    </td>
    <td align="center">
      <a href="https://pd.qq.com/s/eveskv89x">微信</a>
      <br>
      <img src="./public/image/wechat.png" alt="qq-channel" height="256px">
    </td>
  </tr>
</table>

## 🌐 Demo站

由于没有好的沙箱环境用于部署Demo，且Docker部署门槛不高，故不再提供Demo预览

## 预览

<details>
  <summary>点击查看预览图</summary>
  <div>
    <img src="./public/image/intro/01.png" alt="preview">
    <img src="./public/image/intro/02.png" alt="preview">
    <img src="./public/image/intro/03.png" alt="preview">
    <img src="./public/image/intro/04.png" alt="preview">
    <img src="./public/image/intro/05.png" alt="preview">
    <!-- <img src="./public/image/1.webp" alt="preview">
    <img src="./public/image/2.webp" alt="preview">
    <img src="./public/image/3.webp" alt="preview">
    <img src="./public/image/4.webp" alt="preview">
    <img src="./public/image/5.webp" alt="preview">
    <img src="./public/image/6.webp" alt="preview">
    <img src="./public/image/7.webp" alt="preview">
    <img src="./public/image/8.webp" alt="preview">
    <img src="./public/image/9.webp" alt="preview">
    <img src="./public/image/10.webp" alt="preview"> -->
  </div>
</details>

## 困境

市面上有很多消息推送服务,但是各个各的局限,例如:
  + Telegram ➡️ 最优秀的消息推送服务,但是需要魔法
  + 企业微信/钉钉/飞书 ➡️ 消息仅限于企业内部
  + 微信服务号 ➡️ 模板消息限制太多
  + 微信龙虾机器人 ➡️ 支持直接推送到个人微信，但有10条/24小时限制

也有一些开发者,开始转向App推送,更甚者,开始支持手机系统底层推送,例如:
+ pushplus: 支持多渠道推送,包括微信服务号/App/webhook
+ wxpusher: 支持多种手机的系统级推送,不需要App运行

其实市面上的推送服务基本都覆盖到了(**除了万恶之首的微信**),但是我们必须考虑如果作为中转的第三方推送服务宕机了,或者说不玩了,会有什么后端,得更新所有的调用代码/令牌

通过以下几张图,就会明白,自己拥有一个推送服务,是多么的有用:
+ 一对一的消息推送方式

![一对一消息推送方式](./public/image/magicpush01.png)
+ 多对一推送服务

![多对一推送服务](./public/image/magicpush02.png)
+ 使用自己的推送服务

![使用自己的推送服务](./public/image/magicpush03.png)

## ✨ 功能特性

### 消息渠道支持

| 分类 | 渠道 |
|------|------|
| **微信生态** | 微信龙虾机器人、元宝 Bot、企业微信机器人、企业微信应用、微信公众号、Server酱、息知 |
| **即时通讯** | Telegram Bot、飞书机器人、钉钉机器人、QQ机器人 |
| **App推送** | PushPlus、WxPusher、Bark、Meow、PushMe、ntfy、PushDeer、iGot |
| **通用协议** | Webhook、SMTP邮件、Gotify |
| **其他** | 群晖 Chat、ShowDoc、小爱音箱 |

> 📖 各渠道详细配置说明及频率限制请查看：[推送渠道配置文档](https://www.160621.xyz/magicpush/guide/channels/rate-limits.html)

### 核心功能
- 多渠道消息同时推送
- 标准化REST API
- 双令牌JWT认证机制 (access/refresh token)
- 用户注册/登录
- 渠道绑定与配置管理
- 推送接口管理（多接口/多令牌）
- **推送消息关键词过滤**（支持黑名单/白名单模式，按接口独立配置）
- **消息免打扰（DND）**（支持按接口配置多个免打扰时段，全局开关控制）
- 推送历史记录与状态追踪（含接口名称标识）
- 响应式Web管理界面
- 深浅色主题切换

### 安全防护
- **三层限流防护**
  - Nginx 层：IP 级请求频率限制 + 并发连接控制（兜底保护）
  - Express 全局：按 IP 限制每分钟总请求数
  - Express 接口级：针对登录、注册、推送、入站等接口独立限流
- **全局限流开关**：管理员可在前端「安全设置」页面一键启用/禁用所有限流规则（默认开启）
- **动态限流配置**：管理员可在前端「安全设置」页面实时调整所有限流额度，修改立即生效，无需重启服务
- **推送接口双重限流**：同时按来源 IP 和推送 Token 限流，防止 Token 泄露后被滥用
- 限流触发时自动记录日志，方便排查异常请求

本仓库使用 Docker Compose 从源码构建前后端分离服务，包含 Nginx 层的兜底限流。

## 🐳 Docker Compose 部署与更新

服务器需要预先安装 Git、Docker 和 Docker Compose。仓库未提供预构建镜像，以下命令会直接从源码构建前后端服务。

### 首次部署

```bash
git clone https://github.com/HuFakai/magicpush.git
cd magicpush

docker compose up -d
docker compose ps
```

首次启动需要下载基础镜像并构建项目。容器启动成功后，访问 `http://<服务器IP>` 进入管理后台。

查看运行日志：

```bash
docker compose logs --tail=100
docker compose logs -f
```

按 `Ctrl+C` 只会退出日志查看，不会停止服务。

### 更新

进入项目目录，拉取 Fork 仓库的最新代码并重新构建容器：

```bash
cd magicpush
git pull --ff-only
docker compose up -d --build

docker compose ps
docker compose logs --tail=100
```

数据库和日志保存在 Docker 的 `server-data`、`server-logs` 数据卷中，更新容器不会清空已有数据。更新前仍建议备份数据，并且不要执行 `docker compose down -v`，因为 `-v` 会删除数据卷。

如果通过 HTTPS 域名或多层反向代理访问，请在项目目录创建 `.env` 并填写外部地址，以便小爱音箱上传音频后生成正确的在线 URL：

```env
PUBLIC_BASE_URL=https://push.example.com
```

## 🛠️ 技术栈

### 后端
- Node.js 18+
- Express.js 4.x
- SQLite3 (better-sqlite3)
- JWT (jsonwebtoken)
- bcryptjs (密码加密)
- express-rate-limit (API 限流)

### 前端
- Vue 3 (Composition API)
- Vite 5.x
- Tailwind CSS 3.x
- Element Plus
- Pinia (状态管理)
- Vue Router 4.x


## 💖 感谢墙

<table align="center">
  <tr>
    <td align="center">
      <a href="https://github.com/Sunanang">
        <img src="public/image/thanks/Lando.jpg" 
             width="70" 
             height="70"
             style="border-radius:50%;" />
        <br /><sub>Lando</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/tt-haogege">
        <img src="https://avatars.githubusercontent.com/u/56960885?v=4"
             width="70"
             height="70"
             style="border-radius:50%;" />
        <br /><sub>tt-haogege</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/HuFakai">
        <img src="https://avatars.githubusercontent.com/u/54195943?v=4"
             width="70"
             height="70"
             style="border-radius:50%;" />
        <br /><sub>HuFakai</sub>
      </a>
    </td>
  </tr>
</table>

## 📄 许可证

MIT License
