# 个人导航页 · 部署说明

技术栈：Cloudflare Pages（托管前端 + Functions 接口）+ Cloudflare D1（数据库）

## 目录结构

```
nav-project/
├── public/
│   └── index.html        # 前端页面
├── functions/
│   ├── _lib/auth.js       # 鉴权工具函数
│   └── api/
│       ├── data.js        # GET  获取全部数据（公开）
│       ├── login.js       # POST 校验管理密码
│       ├── categories.js  # POST 新增分类（需管理密码）
│       ├── categories/[id].js  # DELETE 删除分类
│       ├── links.js       # POST 新增标签（需管理密码）
│       └── links/[id].js  # PUT/DELETE 编辑、删除标签
├── schema.sql             # 数据库表结构 + 初始示例数据
└── wrangler.toml          # Cloudflare 项目配置
```

## 部署步骤

前提：安装好 Node.js，并全局安装 wrangler（Cloudflare 官方 CLI）：

```bash
npm install -g wrangler
wrangler login
```

### 1. 创建 D1 数据库

```bash
cd nav-project
wrangler d1 create personal-nav-db
```

命令执行后会输出一个 `database_id`，把它填进 `wrangler.toml` 里 `database_id = "..."` 的位置。

### 2. 初始化数据库表结构

```bash
wrangler d1 execute personal-nav-db --remote --file=./schema.sql
```

（本地调试可以先加 `--local` 而不是 `--remote` 跑一遍看看效果）

### 3. 设置管理密码（不会出现在代码里，安全存放在 Cloudflare）

```bash
wrangler pages secret put ADMIN_PASSWORD
```

执行后会提示你输入密码，输入你想要的管理密码即可（这就是以后点"管理员登录"要输入的密码）。

> 注意：这一步是给 **Pages 项目** 设置密钥，需要先完成一次部署创建项目（见下一步），如果提示项目不存在，先执行第 4 步部署一次，再回来设置密钥，然后重新部署一次让密钥生效。

### 4. 部署到 Cloudflare Pages

```bash
wrangler pages deploy public --project-name=personal-nav
```

首次部署会引导你创建 Pages 项目。部署成功后会给你一个 `https://personal-nav.pages.dev` 的地址，直接打开就能用。

### 5. 绑定 D1 数据库到 Pages 项目

Pages 项目和 Worker 的 D1 绑定配置略有不同，最简单的方式是去 Cloudflare Dashboard：

1. 打开 Dashboard → Workers & Pages → 你的 `personal-nav` 项目 → **Settings → Functions**
2. 找到 **D1 database bindings**，添加绑定：Variable name 填 `DB`，选择你刚创建的 `personal-nav-db`
3. 保存后，回到 **Deployments**，触发一次重新部署（Retry deployment）让绑定生效

### 6. 之后要更新代码

修改完 `public/index.html` 或 `functions/` 里的文件后，重新执行：

```bash
wrangler pages deploy public --project-name=personal-nav
```

## 日常使用

- 打开你的 `xxx.pages.dev` 地址，默认是**只读**状态，任何人都能看
- 点右上角"管理员登录"，输入你设置的 `ADMIN_PASSWORD`，验证通过后本机浏览器会记住登录状态（存在 localStorage），之后就能添加/编辑/删除分类和标签
- 换一台设备或清了浏览器数据，需要重新登录一次
- 如果想换绑自己的域名，去 Pages 项目的 **Custom domains** 里添加即可

## 后续可以扩展的方向

- 给标签加拖拽排序
- 加"收藏/常用置顶"
- 加多用户（目前是单一管理密码，所有能登录的人权限一样）
- 把 favicon 换成自己上传的图标，而不是依赖 Google 的抓取服务
