# 第三方代码与内容

本项目原创应用代码采用 AGPL-3.0-only。以下第三方代码保留各自许可证，顶层许可证不会覆盖其原始版权声明。

| 软件 | 安装版本 | 许可证 | 原文 |
| --- | --- | --- | --- |
| react | 19.2.6 | MIT | [许可证](LICENSES/react-LICENSE.txt) |
| react-dom | 19.2.6 | MIT | [许可证](LICENSES/react-dom-LICENSE.txt) |
| scheduler | 0.27.0 | MIT | [许可证](LICENSES/scheduler-LICENSE.txt) |
| lucide-react | 1.31.0 | ISC | [许可证](LICENSES/lucide-react-LICENSE.txt) |
| tailwindcss | 4.2.1 | MIT | [许可证](LICENSES/tailwindcss-LICENSE.txt) |
| OpenAI Sites 构建插件及保留的项目脚手架 | 工程中固定副本 | MIT | [许可证](LICENSES/openai-sites-MIT.txt) |
| shadcn UI 组件与样式 | 工程中固定副本 | MIT | [许可证](LICENSES/shadcn-MIT.txt) |

其他开发依赖及版本见 `source/package.json` 和 `source/package-lock.json`；安装的包保留各自许可证。`source/build/sites-vite-plugin.LICENSE` 与 `source/vendor/shadcn-tailwind-4.13.0.LICENSE.md` 也原样保留。

## 官方数据和品牌

- 麦当劳、联名品牌名称、商标、公告和海报权利归其各自权利人；本仓库的开源许可不授予这些素材或服务的使用权。
- 在线页面通过用户本人授权的麦当劳 MCP 查询官方活动和菜单，图片从官方域名加载；源码仓库不打包联名海报。
- `source/tests/fixtures/calendar.json` 是自行编写的合成结构样例，不是真实账户记录或实时促销承诺。
- `source/tests/fixtures/official-restaurants.json` 仅含公开门店名称、地址和门店坐标，用于历史匹配回归；这些不是用户个人位置。
- 地图找店使用高德 URI；可选街道识别使用 Photon。访问相关服务须遵守相应服务规则。

项目使用 Codex 辅助开发；没有声称获得麦当劳、联名品牌、TI 或 WorkBuddy 官方背书。
