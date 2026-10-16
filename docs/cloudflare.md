# 部署到自己的 Cloudflare 账户

## Pages + Functions：域名 DNS 保留在原服务商

此方式将网页与 MCP API 一起部署到 Cloudflare Pages，浏览器请求同域的 `/api/mcd` 和 `/api/map`。API 由 Pages Advanced mode 的 `_worker.js` 执行，并非仅上传静态页面。代码入口是 `source/build/pages-api-worker.ts`，配置源是 `source/wrangler.pages.jsonc`。

### 当前项目与再次发布

本项目已经在所有者的 Cloudflare 账户中创建以下资源，正常更新时直接复用，不要再次创建：

- Pages 项目：`maimai-collab-gallery`，生产分支为 `main`，默认地址为 <https://maimai-collab-gallery.pages.dev>。
- D1 数据库：`maimai-collab-gallery`，绑定名为 `DB`，真实数据库 ID 已写入 `source/wrangler.pages.jsonc`。
- 数据库迁移：`service_limits` 表已初始化，用于定位服务限速，不存储 Token。
- 自定义子域名：`maimai.morpho-ai.com`；阿里云 DNS 已添加 CNAME，目标为 `maimai-collab-gallery.pages.dev`。对外使用前，以 Pages 控制台中的域名验证和 HTTPS 证书状态为准。

在已有授权的所有者账户中，从 `source/` 重新发布：

```bash
npx wrangler whoami
npm run deploy:cloudflare-pages
```

首次安装依赖或锁文件变化后，先运行 `npm ci`。仅在新增数据库迁移时，再执行 `npx wrangler d1 migrations apply DB --remote --config wrangler.pages.jsonc`；重复部署网页无需新建数据库或重复初始化表。

发布脚本会重新构建。产物位于 `cf-pages-dist/`，其中 `_routes.json` 只让 `/api/*` 执行函数；其余资源由静态托管返回，未知页面返回 404。构建还会在仓库根目录生成 `.cloudflare-pages/wrangler.jsonc`，供当前 Wrangler 的 Pages 命令使用，并避开 Worker 构建的配置重定向。Pages 的发布命令使用 `--cwd ../.cloudflare-pages`，不要改成 `--config wrangler.pages.jsonc`。不要手动修改生成文件；绑定或变量应改源配置后重新构建。

### Wrangler 登录与设备授权

控制台登录与 Wrangler CLI 授权是两件事。已有授权可继续使用；只有新环境或授权失效时才需重新登录。本项目 Pages 与 D1 部署使用以下四项 OAuth 权限：

```bash
npx wrangler login --scopes account:read user:read pages:write d1:write
```

如果浏览器无法连通旧版 Wrangler 的 `localhost:8976` 回调，可使用新版的设备授权。本次验证通过的版本为 `4.151.0`，无需更改项目锁文件中的 Wrangler 版本：

```bash
npx --yes wrangler@4.151.0 login --device --browser=false --scopes account:read user:read pages:write d1:write
```

在浏览器打开命令输出的验证链接，核对一次性设备码并授权，保持终端运行直到显示登录成功。设备授权不需要 localhost 回调，也不要同时添加 `--callback-host` 或 `--callback-port`。Wrangler 自动请求的 `offline_access` 用于续期；资源权限仍保持上述四项，不使用省略 `--scopes` 的默认全权限登录。

Windows PowerShell 如果通过 `npm.ps1` 启动的命令吞掉参数，可以使用 `npx.cmd` 替代 `npx`。如仍有问题，直接运行已下载的新版 Wrangler 脚本，保留同样的参数；将下面的占位路径替换成实际安装位置，不要把 OAuth 凭据写入仓库：

```powershell
node "<新版Wrangler安装目录>/bin/wrangler.js" login --device --browser=false --scopes account:read user:read pages:write d1:write
```

参考：[设备授权说明](https://developers.cloudflare.com/workers/wrangler/commands/general/#use-wrangler-login-without-a-local-callback-server)。

### 仅限新账户或新项目的首次创建

以下步骤供尚无对应资源的部署使用。先确认当前账户和现有项目、数据库；本项目所有者的再次发布应使用上面的更新步骤。复制到其他账户时，必须把源配置中现有的 D1 ID 替换为新账户实际创建的数据库 ID。

安装依赖、完成上面的 CLI 授权后，在 `source/` 中执行：

```bash
npm ci
npm run build:cloudflare-pages
npx wrangler pages project create maimai-collab-gallery --production-branch main --cwd ../.cloudflare-pages
npx wrangler d1 create maimai-collab-gallery --config wrangler.pages.jsonc
```

如果项目名或数据库已经存在，复用正确的现有资源，不要反复运行创建命令。将创建结果中的真实 ID 写入 `wrangler.pages.jsonc`；如果更换了 Pages 项目名，也同步修改配置中的 `name`：

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "maimai-collab-gallery",
  "database_id": "创建命令返回的数据库ID",
  "migrations_dir": "drizzle"
}]
```

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.pages.jsonc
npm run deploy:cloudflare-pages
```

如果不需要可选定位，可以省略 D1 创建和迁移，并移除源配置的 `d1_databases`。联名活动、手动查店和菜单核对仍可使用；定位反向查询会提示手动输入。

### 外部 DNS 的自定义子域名

1. 先在 Pages 项目的 **Custom domains** 中添加子域名，例如 `maimai.morpho-ai.com`。
2. 在阿里云等当前 DNS 服务商新增 CNAME：主机记录为 `maimai`，记录值为 Pages 项目的实际域名 `maimai-collab-gallery.pages.dev`。不要修改已有主站的 apex 记录。
3. 返回 Pages 完成验证，等待域名和 HTTPS 证书生效，再检查自定义域名下的首页及 `/api/mcd`。只有 DNS 中的 CNAME 而未在 Pages 关联域名，会导致访问失败。

仅使用子域名时，不需要把整个域名的 nameserver 迁移到 Cloudflare。日后发布代码也无需重复添加域名或 CNAME。新站点使用同源 API，自定义域名不需要另行加入 `PUBLIC_WEB_ORIGINS`；该变量用于允许旧 GitHub Pages 前端跨域访问。

参考：[Pages 自定义子域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)、[Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)。

## 独立 Worker + Static Assets

独立 Cloudflare 构建把 React 静态网页和 `/api/mcd`、`/api/map` 放在同一个 Worker，前端使用同源接口，不依赖原有 Sites 域名。源码配置位于 `source/wrangler.cloudflare.jsonc`，不要直接修改每次构建都会覆盖的 `dist/server/wrangler.json`。

### 本地验证

在 `source/` 中执行：

```bash
npm ci
npm run build:cloudflare
node tests/static-build.mjs
node node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json --dry-run
```

独立构建会明确使用同源 API，即使 shell 或 `.env` 中仍有 `VITE_API_ORIGIN`，也不会将旧接口编译到新站点。该构建保留静态安全响应头，且不会发布源码或开发诊断接口。

### 登录与可选定位数据库

这是替代部署方式，当前 Pages 项目无需执行。改用 Worker 时，先确认有对应的 Worker 发布授权；上面仅限 Pages 与 D1 的登录权限不会因此自动扩大。

同一账户可以复用已经创建的 `maimai-collab-gallery` 数据库：将 `wrangler.pages.jsonc` 中的 `d1_databases` 复制到 `wrangler.cloudflare.jsonc`，无需再次建库。只有新账户且不存在可复用数据库时才运行：

```bash
npx wrangler d1 create maimai-collab-gallery --config wrangler.cloudflare.jsonc
```

在 `wrangler.cloudflare.jsonc` 中增加以下字段，填写创建命令返回的真实数据库 ID：

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "maimai-collab-gallery",
  "database_id": "创建命令返回的数据库ID",
  "migrations_dir": "drizzle"
}]
```

新数据库或新增迁移时执行：

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
```

数据库只用于定位服务的请求限速，不存储 Token。没有绑定数据库时，联名活动、手动查店和菜单核对仍可使用；可选的定位反向查询会提示手动输入。需要保留定位功能时，请在发布前完成数据库绑定和迁移。

### 发布

```bash
npm run deploy:cloudflare
```

此命令会重新构建并发布网页与 Worker。每位访客在页面输入自己的麦当劳 MCP Token，无需在 Cloudflare 中配置统一的麦当劳 Token。

`PUBLIC_WEB_ORIGINS` 默认仅允许此项目的 GitHub Pages 来源。如果更新 GitHub Pages 前端指向新后端，可继续使用该允许列表；新站点自身的同源请求不依赖它。

Worker Custom Domains 需要账户中已有激活的 Cloudflare zone。如果只希望在原 DNS 服务商添加子域名解析，优先使用上面的 Pages 方式。独立 Cloudflare 账户和自定义域名不代表已经获得中国大陆节点，发布后仍需在目标用户网络验证页面和真实 MCP 查询。

## 发布后检查

- 首页和静态资源通过 HTTPS 加载，网页请求发往同域的 `/api/mcd`。
- 未填写 Token 的请求返回明确的 401 错误，未知 API 和源码路径返回 404。
- 使用自己的有效 Token 验证活动、门店和商品查询；不要将 Token 写进命令、仓库或截图。
- 若启用定位，确认 D1 表已初始化，并验证失败时仍能手动输入地点。
