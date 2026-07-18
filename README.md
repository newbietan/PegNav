# PegNav · 个人导航

基于 **Cloudflare Worker + D1 + Hono + Vite/TypeScript** 的个人导航页。

- 公开只读浏览分类与链接卡片
- 管理员密码登录后可增删改分类/链接
- 搜索栏可跳转百度 / Bing / Google
- 钉板（pegboard）风格前端

**推荐部署方式：Cloudflare 控制台连接 GitHub，推送代码后自动构建部署。** 无需在本机安装 Wrangler 或执行本地部署命令。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + TypeScript（无 UI 框架） |
| API | Hono（Cloudflare Worker） |
| 数据 | Cloudflare D1 |
| 静态资源 | Worker Assets |
| 部署 | Cloudflare Dashboard ↔ GitHub |

## 目录结构

```
PegNav/
├── src/
│   ├── client/          # 前端（Vite root）
│   └── worker/          # Hono Worker + API 路由
├── schema.sql           # D1 表结构与示例数据
├── wrangler.toml        # Worker / D1 / Assets（控制台构建会读此文件）
├── vite.config.ts
└── package.json
```

---

## 一键部署（Cloudflare 控制台 + GitHub）

按顺序在浏览器里完成即可。

### 0. 代码在 GitHub 上

仓库示例：`https://github.com/newbietan/PegNav`  
确保 `main` 分支是最新代码（含本 README 与 `src/`）。

### 1. 创建 D1 数据库

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧 **Storage & Databases → D1 SQL Database**
3. **Create database**
   - Name：`personal-nav-db`（可自定，需与后文一致）
4. 创建完成后进入该库，复制 **Database ID**（一串 UUID）

### 2. 把 Database ID 写进仓库

编辑仓库中的 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "personal-nav-db"
database_id = "此处粘贴你刚复制的 Database ID"
```

`binding` 必须保持为 `DB`（与代码中 `env.DB` 一致）。  
保存后 **commit 并 push 到 GitHub**（控制台构建会用到这个文件）。

### 3. 用控制台导入表结构

1. 仍在该 D1 数据库页面，打开 **Console**（或 Query）
2. 打开本仓库的 `schema.sql`，**全文复制**
3. 粘贴到控制台执行（创建 `categories` / `links` 并写入示例数据）

> 若提示表已存在，可只执行建表失败后的部分，或先清空库再执行。

### 4. 连接 GitHub 创建 Worker

1. Dashboard → **Workers & Pages** → **Create**
2. 选择 **Import a repository** / 连接 GitHub（首次需授权仓库权限）
3. 选中 `newbietan/PegNav`（或你的 fork），分支 `main`
4. 构建设置建议：

| 配置项 | 建议值 |
|--------|--------|
| 项目类型 | Worker |
| 构建命令 | `npm run build` |
| 部署 / 配置 | 使用仓库根目录的 `wrangler.toml`（默认即可） |
| 根目录 | `/`（仓库根） |

5. 保存并触发首次部署

若控制台提供「使用 wrangler.toml」类选项，请开启，这样 Assets 与 D1 绑定会与仓库配置一致。

### 5. 绑定 D1（若构建未自动带上）

1. 进入该 Worker → **Settings → Bindings**
2. 确认存在：
   - **D1**：Variable name = `DB`，指向 `personal-nav-db`
   - **Assets**：一般由 `wrangler.toml` 的 `[assets]` 自动处理
3. 若缺失 D1，手动添加后 **重新部署** 一次

### 6. 设置管理密码（Secret）

1. 该 Worker → **Settings → Variables and Secrets**
2. **Add** → 类型选 **Secret**
3. Name：`ADMIN_PASSWORD`
4. Value：你的管理密码（不会出现在代码里）
5. 保存；如提示需重新部署，点一次 **Deploy** / Retry

### 7. 访问站点

部署成功后，在 Worker 的 **Domains** 或 Overview 里打开  
`https://<你的项目名>.<子域>.workers.dev`（或你绑定的自定义域名）。

- 默认只读
- 右上角「管理员登录」→ 输入刚设置的 `ADMIN_PASSWORD`

### 8. 之后更新

本地或 GitHub 上改代码 → **push 到 `main`** → Cloudflare 自动构建部署。  
改 Secret / 绑定后如未自动生效，在 Deployments 里手动 **Retry deployment**。

---

## 日常使用

- 打开站点默认为**只读**
- 点「管理员登录」，输入你在控制台配置的 `ADMIN_PASSWORD`
- 登录态保存在浏览器 `localStorage`（键名 `admin_pw`），换设备或清缓存需重新登录

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

## 部署检查清单

- [ ] GitHub 仓库为最新 `main`
- [ ] D1 已创建，`wrangler.toml` 中 `database_id` 为真实 UUID 并已 push
- [ ] 已在 D1 Console 执行 `schema.sql`
- [ ] Workers 已连接该 GitHub 仓库，构建命令 `npm run build`
- [ ] Binding `DB` → 目标 D1
- [ ] Secret `ADMIN_PASSWORD` 已设置
- [ ] 打开站点可加载数据；登录后可增删改

## 常见问题

**页面空白或接口 500**  
→ D1 未绑定、`database_id` 错误，或未执行 `schema.sql`。

**登录一直失败**  
→ 检查 Secret 名是否为 `ADMIN_PASSWORD`（大小写一致），改 Secret 后是否重新部署。

**静态页有、接口 404**  
→ 确认是 Worker 部署且 `wrangler.toml` 含 `run_worker_first = ["/api/*"]`，不要用「仅静态 Pages」方式导入。

**构建失败**  
→ 查看 Deployments 日志；需能执行 `npm install` 与 `npm run build`（Node 版本建议 18+）。

## 后续优化建议

1. **安全**：登录改为短期 signed token；登录接口限流；CSP 头  
2. **体验**：站内卡片过滤、分类重命名、拖拽排序（`sort_order`）  
3. **资源**：Favicon 多源兜底或 R2 自定义图标  

## License

见 [LICENSE](./LICENSE)
