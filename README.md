<div align="center">
  <img src="./assets/logo.svg" alt="PegNav" width="480">
  <p>一个基于 Cloudflare Workers 的 Serverless 个人导航页：分类卡片、书签导入导出、站内筛选与管理员后台。</p>
  <p><b>极致轻量 · 一键部署 · 钉板工坊 UI</b></p>
  <p>
    <a href="https://github.com/newbietan/PegNav/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/newbietan/PegNav?style=flat&logo=github"></a>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
    <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-F38020?style=flat&logo=cloudflare&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white">
    <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white">
    <img alt="Hono" src="https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white">
    <img alt="D1" src="https://img.shields.io/badge/Cloudflare%20D1-F38020?style=flat&logo=cloudflare&logoColor=white">
  </p>
  <p>
    <a href="#highlights">核心优势</a> ·
    <a href="#features">功能特性</a> ·
    <a href="#quick-start">部署指南</a> ·
    <a href="#usage">日常使用</a> ·
    <a href="#architecture">架构设计</a> ·
    <a href="#api">API</a> ·
    <a href="#faq">常见问题</a> ·
    <a href="#license">开源协议</a>
  </p>
</div>

> [!TIP]
> **Fork 仓库 → Cloudflare 一键部署 → 设置管理密码** 即可使用。  
> D1 数据库、表结构与示例数据会自动完成，无需手工建库或执行 SQL。自定义域名可选。

## 效果演示

> 暖色钉板（pegboard）风格：分类分区、网站卡片、搜索栏与管理弹窗。公开只读；登录后可增删改、拖拽排序、导入导出。

<div align="center">
  <img src="./assets/demo.png" alt="PegNav 演示截图" width="900" />
  <p><sub>部署完成后打开站点即可体验完整界面</sub></p>
</div>

## 目录

- [核心优势](#highlights)
- [核心特性](#features)
- [快速部署](#quick-start)
  - [一键部署](#一键部署)
  - [设置管理密码](#设置管理密码)
  - [（可选）绑定自定义域名](#可选绑定自定义域名)
- [日常使用](#usage)
- [架构说明](#architecture)
- [API 一览](#api)
- [开发说明](#development)
- [常见问题](#faq)
- [开源协议](#license)

<a id="highlights"></a>
## 核心优势

### 极致 Serverless

- **零服务器成本**：Cloudflare Workers + D1 + Assets，无需自建 VPS。
- **边缘加速**：静态资源与 API 同域部署，全球边缘节点分发。
- **数据库全自动**：部署时自动开通并绑定 D1；首次访问自动建表并写入示例数据。

### 开箱即用

- **GitHub 一键部署**：控制台 Import 仓库即可构建上线。
- **最少配置**：用户只需设置管理密码；域名可选。
- **现代化前端**：Vite + TypeScript，无 UI 框架依赖，产物小、加载快。

### 安全可靠

- **短期 HMAC Token**：登录签发 7 天会话 token，前端不长期存明文密码。
- **登录限流**：按 IP 限制失败次数，降低暴力尝试风险。
- **安全响应头**：CSP、`X-Frame-Options`、`nosniff` 等。
- **URL 校验**：前后端统一规范化，拒绝危险协议与非法域名。

<a id="features"></a>
## 核心特性

- **分类 + 链接卡片**：钉板视觉、favicon（Google 优先 + Worker 代理兜底）。
- **管理员后台**：新建 / 重命名 / 删除分类；添加 / 编辑 / 删除链接。
- **拖拽排序**：管理态拖分类把手或卡片，顺序自动保存。
- **站内筛选**：搜索栏「站内」模式按标题 / URL / 域名 / 分类名过滤；`/` 快捷聚焦。
- **外站搜索**：百度 / Bing / Google 一键跳转。
- **书签导入**：支持 Chrome / Edge / Firefox 导出的 HTML；合并或整库替换。
- **书签导出**：HTML（可再导入）或 JSON 备份。
- **多端适配**：手机 / 平板 / 桌面响应式。
- **加载体验**：首屏骨架屏、失败可重试、toast 提示。

<a id="quick-start"></a>
## 快速部署

你只需要完成下面步骤，其它（数据库、建表、示例数据）都会自动处理。

### 一键部署

1. **Fork** 本仓库：[`newbietan/PegNav`](https://github.com/newbietan/PegNav)。
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**。
3. 选择 **Import a repository**，授权 GitHub 并选中你的 Fork，分支 `main`。
4. 构建命令填写：

| 配置项 | 建议值 |
|--------|--------|
| 构建命令 | `npm run build` |
| 部署命令 | 默认即可（一般无需修改） |
| 根目录 | `/` |

5. 保存并触发首次部署，等待构建成功。

### 设置管理密码

1. 进入该 Worker → **Settings → Variables and Secrets**。
2. **Add** → 类型选择 **Secret**。
3. Name 填写：`ADMIN_PASSWORD`  
4. Value 填写：你的管理密码。
5. 保存；如提示需要，再部署一次。

> 密码不要写进代码或提交到 GitHub。

### （可选）绑定自定义域名

1. 进入该 Worker → **Settings → Domains & Routes**（或 **Triggers / Custom Domains**，以面板文案为准）。
2. 选择 **Add** / **Add Custom Domain**。
3. 输入你已托管在 Cloudflare 的域名（例如 `nav.example.com`）并确认。
4. 按提示完成 DNS（通常由面板自动添加记录）。
5. 生效后可用自定义域名访问；不绑定则继续使用默认的 `*.workers.dev` 地址。

> 域名需先加入你的 Cloudflare 账号。仅使用 `workers.dev` 时可跳过本步。

### 开始使用

打开 Worker 提供的访问地址（`*.workers.dev` 或你的自定义域名）。  
首次打开会自动初始化数据；使用刚设置的密码登录即可管理。

之后只需 `git push` 到 `main`，Cloudflare 会自动重新构建部署。

<a id="usage"></a>
## 日常使用

| 操作 | 说明 |
|------|------|
| 浏览 | 默认只读，点击卡片打开网站 |
| 登录 | 右上角「管理员登录」，密码为 `ADMIN_PASSWORD` |
| 会话 | 浏览器保存短期 token（约 7 天），非明文密码 |
| 站内筛选 | 搜索栏选「站内」，输入关键词；快捷键 `/` 聚焦 |
| 外站搜索 | 切换百度 / Bing / Google 后回车或点 → |
| 排序 | 管理态：分类左侧 `⋮⋮` 拖分类，卡片可拖拽 |
| 导入 | 「导入书签」上传浏览器导出的 HTML |
| 导出 | 「导出」选择 `html` 或 `json` |
| 退出 | 「退出管理」清除本地登录状态 |

<a id="architecture"></a>
## 架构说明

```text
浏览器
  │  GET /              → Worker Assets（Vite 构建产物）
  │  /api/*             → Hono 路由
  ▼
Cloudflare Worker
  ├── Hono API（数据 / 登录 / 导入导出 / 图标 / 排序）
  ├── Assets            → dist/client
  └── D1 (DB)           → categories / links（自动开通与建表）
```

| 层 | 技术 |
|----|------|
| 前端 | Vite · TypeScript · 原生 DOM |
| API | Hono · Cloudflare Workers |
| 数据 | Cloudflare D1 |
| 鉴权 | HMAC Token（Bearer） |
| 部署 | Cloudflare Dashboard ↔ GitHub |

<a id="api"></a>
## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/data` | 否 | 全量分类与链接 |
| POST | `/api/login` | 否 | 校验密码，返回 `{ token, expires_at }` |
| GET | `/api/login/me` | Bearer | 校验会话 |
| POST | `/api/categories` | Bearer | 新建分类 |
| PUT | `/api/categories/:id` | Bearer | 重命名分类 |
| DELETE | `/api/categories/:id` | Bearer | 删除分类 |
| POST | `/api/links` | Bearer | 新建链接 |
| PUT | `/api/links/:id` | Bearer | 编辑链接 |
| DELETE | `/api/links/:id` | Bearer | 删除链接 |
| PUT | `/api/reorder` | Bearer | 批量更新顺序 |
| POST | `/api/import` | Bearer | 批量导入（`merge` / `replace`） |
| GET | `/api/favicon` | 否 | 图标代理（`?url=`） |

```http
Authorization: Bearer <session_token>
```

<a id="development"></a>
## 开发说明

### 目录结构

```text
PegNav/
├── src/
│   ├── client/              # 前端（Vite）
│   ├── worker/              # Hono Worker + API
│   └── shared/              # 前后端共用（URL 规范化等）
├── assets/                  # README 图片（logo / demo）
├── wrangler.toml
├── vite.config.ts
├── package.json
└── LICENSE
```

### 本地构建（可选）

推荐直接使用 Cloudflare 控制台部署。若需本地校验：

```bash
npm install
npm run typecheck
npm run build
```

<a id="faq"></a>
## 常见问题

**打开站点没有数据 / 接口报错**  
→ 确认部署已成功，并已设置 Secret `ADMIN_PASSWORD`；稍等片刻后强刷页面。首次访问会自动初始化数据库。

**登录失败**  
→ 确认 Secret 名为 `ADMIN_PASSWORD`；修改密码后需重新登录；失败次数过多会被短暂限流。

**构建失败**  
→ 在 Cloudflare Deployments 日志中查看详情；构建命令应为 `npm run build`。

**想用自己的域名**  
→ 见上文 [（可选）绑定自定义域名](#可选绑定自定义域名)。

**图标只显示字母**  
→ 强刷缓存；个别网站无图标时会显示标题首字母兜底。

**拖拽无效**  
→ 需先管理员登录；开启站内筛选时会暂时禁用排序，清空关键词后再试。

<a id="license"></a>
## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

---

<div align="center">
  <sub>Built with Cloudflare Workers · Hono · Vite · TypeScript</sub>
</div>
