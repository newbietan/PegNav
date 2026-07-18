# PegNav · 个人导航

基于 **Cloudflare Worker + D1 + Hono + Vite/TypeScript** 的个人导航页。

- 公开只读浏览分类与链接卡片
- 管理员登录后可增删改分类/链接（重命名、拖拽排序）
- 短期 HMAC Token 登录（不再长期存明文密码）
- 站内筛选 + 外站搜索（百度 / Bing / Google）
- 导入 / 导出 HTML 书签与 JSON 备份
- URL 自动规范化与校验
- 登录失败限流、安全响应头
- 钉板风格前端，多端响应式，加载骨架与失败重试

**推荐：Cloudflare 控制台连接 GitHub 一键部署。**  
D1 可在部署时**自动创建并绑定**；表结构与示例数据在**首次访问接口时自动初始化**。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + TypeScript（无 UI 框架） |
| API | Hono（Cloudflare Worker） |
| 数据 | Cloudflare D1（自动开通 + 运行时建表） |
| 图标 | Worker `/api/favicon` 代理抓取 + 边缘缓存 |
| 静态资源 | Worker Assets |
| 部署 | Cloudflare Dashboard ↔ GitHub |

## 目录结构

```
PegNav/
├── src/
│   ├── client/          # 前端（Vite root）
│   └── worker/          # Hono Worker + API + 自动 schema
├── schema.sql           # 参考 SQL（通常不必手工执行）
├── wrangler.toml        # 仅声明 D1 binding，不写 database_id
├── vite.config.ts
└── package.json
```

---

## 一键部署（Cloudflare 控制台 + GitHub）

### 0. 代码在 GitHub

仓库：`https://github.com/newbietan/PegNav`  
确保 `main` 为最新。

### 1. 连接 GitHub 创建 Worker

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
2. **Import a repository**，授权并选择本仓库，分支 `main`
3. 构建设置：

| 配置项 | 建议值 |
|--------|--------|
| 构建命令 | `npm run build` |
| 部署命令 | 默认 `npx wrangler deploy`（一般不用改） |
| 根目录 | `/` |

4. 保存并触发首次部署  

`wrangler.toml` 里 **没有** `database_id`，部署时会走 Cloudflare 的 **Automatic provisioning**（自动创建 D1 并绑定到 `DB`）。

### 2. 设置管理密码（唯一需要手动的配置）

1. 该 Worker → **Settings → Variables and Secrets**
2. **Add** → **Secret**
3. Name：`ADMIN_PASSWORD`  
4. Value：你的管理密码  
5. 保存；若提示重新部署，点一次 Deploy / Retry  

> 密码不能写进代码或 GitHub。Secret 只能在控制台配置。

### 3. 确认 D1 绑定（一般自动完成）

Worker → **Settings → Bindings**：应有 **D1**，变量名 **`DB`**。  

若首次部署后没有：

- 再 **Retry deployment** 一次；或  
- 在 Bindings 里手动添加 D1（Variable name = `DB`），再部署  

### 4. 打开站点

使用 Worker 提供的 `*.workers.dev` 地址。  

首次打开页面会请求 `/api/data`：自动建表；若库为空，写入示例分类/链接。

### 5. 之后更新

push 到 `main` → Cloudflare 自动构建部署。

---

## 自动完成了什么 / 什么仍要手动

| 步骤 | 是否自动 |
|------|----------|
| 创建 D1 数据库 | ✅ 部署时自动开通（需账号支持 Automatic provisioning） |
| 绑定到 Worker（`DB`） | ✅ 同上 |
| 建表 + 空库示例数据 | ✅ 首次 `/api/*` 请求时（`src/worker/schema.ts`） |
| 设置 `ADMIN_PASSWORD` | ❌ 控制台 Secret（安全要求） |
| 连接 GitHub / 点创建 | ❌ 控制台一次性操作 |

若自动开通不可用（账号/权限/区域限制），在控制台手动建 D1，绑定名填 **`DB`**，**不必**再把 `database_id` 写回仓库。

## 日常使用

- 默认只读；「管理员登录」使用 `ADMIN_PASSWORD`
- 登录态在浏览器 `localStorage`（`admin_pw`）

## API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/data` | 否 | 全量分类与链接 |
| POST | `/api/login` | 否 | 校验密码 |
| GET | `/api/login/me` | Bearer | 校验会话 |
| POST | `/api/categories` | Bearer | 新建分类 |
| PUT | `/api/categories/:id` | Bearer | 重命名分类 |
| DELETE | `/api/categories/:id` | Bearer | 删除分类 |
| POST | `/api/links` | Bearer | 新建链接 |
| PUT | `/api/links/:id` | Bearer | 编辑链接 |
| DELETE | `/api/links/:id` | Bearer | 删除链接 |
| PUT | `/api/reorder` | Bearer | 批量更新分类/链接顺序 |
| POST | `/api/import` | Bearer | 批量导入书签（merge / replace） |

鉴权：`Authorization: Bearer <ADMIN_PASSWORD>`

## 检查清单

- [ ] GitHub `main` 已最新  
- [ ] Worker 已连接仓库，构建命令 `npm run build`  
- [ ] Bindings 中有 D1 → `DB`  
- [ ] Secret `ADMIN_PASSWORD` 已设置  
- [ ] 打开站点能看到示例数据；能登录管理  

## 常见问题

**接口 503 / 数据库未就绪**  
→ 绑定未生效：检查 Bindings 是否有 `DB`，然后重新部署。

**登录失败**  
→ Secret 名必须是 `ADMIN_PASSWORD`；改完后重新部署。

**构建失败**  
→ 看 Deployments 日志；需 Node 能跑 `npm install` + `npm run build`。

**想清空示例数据**  
→ D1 控制台里删数据即可；不会再次自动灌入（仅「分类数为 0」时 seed）。

## 后续优化建议

1. 登录改为短期 token；登录限流；CSP  
2. 站内过滤、分类重命名、拖拽排序  
3. Favicon 多源兜底  

## License

见 [LICENSE](./LICENSE)
