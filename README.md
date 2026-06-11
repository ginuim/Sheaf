# Sheaf

为专注写作而生的 Markdown 编辑器。分屏预览、AI 改写、本地文件与 PDF 导出。

官网：[sheaf.reaidea.com](https://sheaf.reaidea.com/)

## 功能

- **分屏实时预览** — 等宽编辑区与衬线预览同步滚动，支持分屏、仅编辑、仅预览三种视图
- **章节大纲** — 自动提取标题层级，点击即可跳转
- **AI 段落改写** — 自然语言描述修改意图，审阅 diff 后一键应用；应用前自动保存版本快照
- **导出** — PDF、微信公众号 HTML、社交媒体分享卡片与长图
- **排版** — 支持 KaTeX 数学公式、Mermaid 图表、代码高亮；中英文间距自动补齐
- **本地优先** — 文稿与设置保存在本地磁盘，无账号、无云端同步

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | [Tauri](https://tauri.app/) v2 |
| 前端 | Vue 3、TypeScript、Vite |
| 编辑器 | CodeMirror 6 |
| 渲染 | markdown-it、KaTeX、Mermaid |

## 环境要求

- [Node.js](https://nodejs.org/)（建议 LTS）
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)（构建桌面应用时需要）

## 快速开始

```bash
pnpm install
```

### 开发桌面应用

```bash
pnpm tauri dev
```

### 开发官网

官网入口为 `website.html`，对应 `src/website/`：

```bash
pnpm dev:website
```

### 构建

```bash
# 前端（同时产出 index.html 与 website.html）
pnpm build

# macOS 安装包
pnpm build:mac          # 当前架构
pnpm build:mac:arm64    # Apple Silicon
pnpm build:mac:x64      # Intel
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器（桌面应用，端口 1420） |
| `pnpm dev:website` | 启动官网开发服务器 |
| `pnpm build` | 类型检查并构建前端 |
| `pnpm preview` | 预览桌面应用构建产物 |
| `pnpm preview:website` | 预览官网构建产物 |
| `pnpm tauri` | Tauri CLI（`dev` / `build` 等） |

## 项目结构

```
├── index.html          # 桌面应用入口
├── website.html        # 官网入口
├── src/
│   ├── main.ts         # 桌面应用
│   └── website/        # 官网（LandingApp、文档、更新日志等）
├── src-tauri/          # Tauri Rust 后端
├── scripts/
│   ├── collect-dmg.sh              # 收集 macOS DMG 产物
│   ├── deploy-website.sh           # 部署官网到 sheaf.reaidea.com
│   └── nginx-sheaf.reaidea.com.conf.example
└── markra/             # 参考项目（只读，勿修改）
```

## 官网部署

构建后 `dist/` 会同时包含 `index.html`（桌面应用）和 `website.html`（官网）。部署官网时只需 `website.html` 与同级的 `assets/`：

```bash
bash scripts/deploy-website.sh
```

Nginx 配置参考 `scripts/nginx-sheaf.reaidea.com.conf.example`：`root` 指向部署目录，`index` 设为 `website.html`。

## 开发说明

- 包管理使用 `pnpm`
- 图标优先使用 `@lucide/vue`
- `markra/` 为独立参考项目，对照编辑器、导出、AI 等实现；功能改动在主项目 `src/`、`src-tauri/` 中完成
