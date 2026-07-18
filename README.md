# PegNav · 个人导航

基于 **Cloudflare Worker + D1 + Hono + Vite/TypeScript** 的个人导航页。

- 公开只读浏览分类与链接卡片
- 管理员密码登录后可增删改分类/链接
- 搜索栏可跳转百度 / Bing / Google
- 钉板（pegboard）风格前端

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + TypeScript（无 UI 框架） |
| API | Hono（Cloudflare Worker） |
| 数据 | Cloudflare D1 |
| 静态资源 | Worker Assets |

## 目录结构

```
PegNav/
├── src/
│   ├── client/          # 前端（Vite root）
│   └── worker/          # Hono Worker + API 路由
├── schema.sql           # D1 表结构与示例数据
├── wrangler.toml        # Worker / D1 / Assets 配置
├── vite.config.ts
└── package.json
```

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置管理密码

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，设置 ADMIN_PASSWORD
```

### 3. 初始化本地 D1

```bash
npm run db:local
```

### 4. 启动

需要两个终端：

```bash
# 终端 1：Worker API（默认 http://127.0.0.1:8787）
npm run dev:worker

# 终端 2：前端（默认 http://127.0.0.1:5173，/api 代理到 Worker）
npm run dev
```

浏览器打开 Vite 地址即可。

## 部署到 Cloudflare

### 1. 登录并创建 D1

```bash
npx wrangler login
npx wrangler d1 create personal-nav-db
```

将输出的 `database_id` 填入 `wrangler.toml`。

### 2. 初始化远程表结构

```bash
npm run db:remote
```

### 3. 设置管理密码（Worker Secret）

```bash
npx wrangler secret put ADMIN_PASSWORD
```

### 4. 构建并部署

```bash
npm run deploy
```

部署成功后会得到 `*.workers.dev` 地址（或你绑定的自定义域名）。

## 日常使用

- 打开站点默认为**只读**
- 点「管理员登录」，输入 `ADMIN_PASSWORD`
- 登录态保存在浏览器 `localStorage`（键名 `admin_pw`），换设备需重新登录

## API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/data` | 否 | 全量分类与链接 |
| POST | `/api/login` | 否 | 校验密码 |
| POST | `/api/categories` | Bearer | 新建分类 |
| DELETE | `/api/categories/:id` | Bearer | 删除分类 |
| POST | `/api/links` | Bearer | 新建链接 |
| PUT | `/api/links/:id` | Bearer | 编辑链接 |
| DELETE | `/api/links/:id` | Bearer | 删除链接 |

鉴权头：`Authorization: Bearer <ADMIN_PASSWORD>`

## 后续优化建议

1. **安全**：登录改为短期 signed token，勿长期存明文密码；登录接口限流
2. **体验**：站内卡片过滤、分类重命名、拖拽排序（`sort_order`）
3. **工程**：GitHub Actions 自动部署、简单 smoke test
4. **资源**：Favicon 多源兜底或 R2 自定义图标

## License

见 [LICENSE](./LICENSE)
