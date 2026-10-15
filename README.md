# 麦麦联名馆

**先看联名，再查门店，最后打开地图找店。**

面向想了解麦当劳联名周边、出发前核对门店菜单的用户。电脑、平板和手机浏览器均可使用，无需安装 AI 客户端。

[打开网页应用](https://sloughrogge.github.io/maimai-collab-gallery-web/) · [备用站点](https://maimai-collab-gallery.hippocampuss.chatgpt.site/) · [MCP 接入说明](MCP_INTEGRATION.md) · [官方参赛声明](CONTEST_DECLARATION.md)

本项目为麦当劳程序员创意开发大赛参赛作品，非麦当劳官方产品。参赛申请及审核状态见 [参赛记录](docs/contest.md)。喜欢这个项目，欢迎在本仓库点 Star。

## 能做什么

| 功能 | 使用方式 |
| --- | --- |
| 联名活动 | 获取官方活动日历，筛选联名公告，按目录查看海报、状态和购买条件 |
| 门店查询 | 输入城市与公共地标，查看附近门店，每页 3 家 |
| 菜单核对 | 查看单家门店或批量核对最多 6 家，筛选列出相关商品的门店 |
| 地图找店 | 将店名与地址交给高德地图，也可复制地址到其他地图 |
| 可选定位 | 在浏览器授权后识别城市、街道；不可用时仍可手动输入 |

查询使用用户本人的麦当劳 MCP Token。当前作品不执行领券、抽奖、下单或付款；菜单列出商品不代表实时库存，未检出也不代表售罄。

## 在线使用示例

1. 打开网页，点击 **连接账户**。
2. 在 [麦当劳开放平台](https://open.mcd.cn/mcp) 登录，进入控制台激活并复制自己的 Token，回到网页粘贴连接。无需把 Token 发送到 GitHub Issue 或聊天中。
3. 在 **联名活动** 选择感兴趣的公告，点击 **查询门店**。
4. 输入城市 `上海`、公共地标 `漕河泾开发区`，点击查询。
5. 点击门店的 **查看商品** 核对菜单，再点击 **地图找店** 或 **复制地址**。

示例地点是公共地标。实时活动、门店、菜单和价格以用户连接时的官方返回为准；历史活动结束后不保证还能查到同一商品。

Token 仅在当前页面内存中使用，刷新、退出或连接满 30 分钟后清除。请求经过应用后端转发到麦当劳，后端不会主动存储或记录 Token。完整数据流及限制见 [数据说明](docs/privacy.md)。

## 安装与本地运行

需要 Node.js **22.13 或更高版本**（建议 Node.js 22）和 npm。仓库根目录保留已发布的静态网站；可编辑的完整工程在 `source/`。

```bash
git clone https://github.com/sloughrogge/maimai-collab-gallery-web.git
cd maimai-collab-gallery-web/source
npm ci
npm run dev -- --host 127.0.0.1 --port 5180
```

浏览器打开 `http://127.0.0.1:5180/`。活动和手动查店不需要地图 Key，也不需要开发者配置统一的麦当劳 Token。每位用户在页面输入本人 Token。

如需启用可选的定位反向查询，先建立本机 D1 限流表：

```bash
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_tranquil_sue_storm.sql
```

缺少 D1 表或定位服务不可用时，仍可手动填写城市和地标。浏览器定位需要 HTTPS 或 localhost，并取决于浏览器权限、系统定位和设备能力。

## 验证与构建

在 `source/` 中执行：

```bash
npm test
npm run test:origin
npm run typecheck
npm run build
node tests/static-build.mjs
```

查看 [验证记录](docs/validation.md)。单元测试采用测试凭据和固定样例，不需要真实 Token；它们不会自动领取权益或创建订单。

完整生产构建输出：

- `source/dist/client/`：静态前端。
- `source/dist/server/`：Cloudflare Worker API。

本地检查生产版本：

```bash
npm start -- --port 5180
# 在另一终端、同一个 source/ 目录执行
node tests/static-http.mjs
```

## 部署

当前在线版本使用 GitHub Pages 托管前端，现有 Sites 服务托管 API。Pages 自身不执行后端。

在 `source/` 中构建独立前端（POSIX shell 示例；Windows PowerShell 使用 `$env:VITE_API_ORIGIN="https://你的后端域名"` 设置环境变量）：

```bash
VITE_API_ORIGIN=https://maimai-collab-gallery.hippocampuss.chatgpt.site npm run build:pages
```

产物为 `source/pages-dist/`。维护者可运行仓库根目录的 `node scripts/update-static.mjs`，将这些编译文件同步到仓库根目录，再提交到 `main` 发布 Pages。

独立部署时，应部署自己的 Worker API，并把 `VITE_API_ORIGIN` 改成自己的 HTTPS API 来源。API 的 `PUBLIC_WEB_ORIGINS` 需配置为自己的前端完整 HTTPS origin，例如 `https://example.github.io`，不含路径或结尾斜杠，不支持通配域名。预览域名不会自动获得跨域权限。可选定位需要自行绑定 D1 并执行迁移。本仓库不包含现有站点的部署凭据或项目管理标识。

## 代码与文档

```text
README.md                     项目说明、安装和示例
CONTEST_DECLARATION.md         官方原文参赛声明
MCP_INTEGRATION.md             MCP 工具、调用流程和业务价值
mcp-config.example.json       仅含环境变量占位符的 MCP 配置
LICENSE                       AGPL-3.0
THIRD_PARTY_NOTICES.md         第三方代码与数据权利说明
source/app/                   响应式界面与 API 处理
source/lib/                   MCP 传输、活动/菜单解析、定位与地图链接
source/build/                 静态前端与 Worker 构建
source/tests/                 自动化测试和固定样例
index.html、assets/            当前公开网站的编译文件
```

部分早期坐标、路线和抽奖解析工具保留在源码及回归测试中，当前产品入口没有使用它们；完整参赛功能以本 README 的功能表和 MCP 接入说明为准。

## 开源与归属

原创应用代码使用 **AGPL-3.0-only**，第三方代码保留各自许可证。请保留作者与版权声明；复制、修改、分发或通过网络提供修改版时，应遵守适用许可证的源码提供义务。参见 [LICENSE](LICENSE) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。

麦当劳及联名品牌的商标、官方公告、海报与服务不因本仓库开源而获得授权。项目开发使用 Codex 辅助，未提交 WorkBuddy 对话记录，不申报 WorkBuddy 专项奖励。
