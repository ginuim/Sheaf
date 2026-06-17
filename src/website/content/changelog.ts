import type { AppLocale } from "../../i18n";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

const CHANGELOG_ZH: ChangelogEntry[] = [
  {
    version: "0.2.21",
    date: "2026-06",
    title: "Markdown 格式栏",
    items: [
      "编辑区顶部新增 Markdown 格式栏，支持标题、粗体、列表、链接等常用格式",
      "格式栏工具可在设置中开关、排序和自定义",
      "中英文间距格式化按钮移至格式栏",
      "改进 Mac 芯片识别 fallback 逻辑",
    ],
  },
  {
    version: "0.2.20",
    date: "2026-06",
    title: "Mac 芯片识别与官网 SEO",
    items: [
      "官网下载页改进 Mac 芯片识别，支持 Client Hints 与 WebGL 检测",
      "无法识别芯片时默认推荐 Apple 芯片版并提示 Intel 用户手动选择",
      "官网增加 Open Graph、Twitter Card、结构化数据与可抓取静态内容",
      "修复分屏宽度 localStorage 读取逻辑",
    ],
  },
  {
    version: "0.2.19",
    date: "2026-06",
    title: "AI 修改编辑区预览",
    items: [
      "AI 建议可在编辑区预览 diff，支持接受或放弃修改",
      "版本历史弹窗无上一版本时默认显示预览，并优化最小高度",
      "修复编辑器滚动比例计算，考虑文档内边距",
    ],
  },
  {
    version: "0.2.18",
    date: "2026-06",
    title: "同步滚动与导出体验",
    items: [
      "图片保存成功后 Toast 提供「打开目录」快捷操作",
      "修复标点符号后 loose strong marker 解析问题",
      "编辑器与预览区支持同步滚动，分栏宽度可拖拽调整",
      "修复同步滚动在内容边界处的异常",
    ],
  },
  {
    version: "0.2.17",
    date: "2026-06",
    title: "导出图片内联修复",
    items: [
      "导出卡片与长图时内联本地图片，修复图片显示空白",
      "Markdown 图片标记本地路径，支持 Tauri 文件系统读取",
      "导出截图增加重试机制与主题背景色",
    ],
  },
  {
    version: "0.2.16",
    date: "2026-06",
    title: "小红书卡片媒体自适应",
    items: [
      "引入可缩放媒体块，大尺寸图片与图表可等比例收缩以完美适应卡片空间",
      "优化卡片分页算法，改用固定字号并移除耗时的字号迭代循环",
      "卸载组件时自动清理测量元素，避免内存泄漏",
    ],
  },
  {
    version: "0.2.15",
    date: "2026-06",
    title: "本地存储配额管理",
    items: [
      "本地存储超出配额时自动清理旧数据并重试写入",
      "AI 历史、文档版本与草稿写入增加容量预算与内容截断",
    ],
  },
  {
    version: "0.2.14",
    date: "2026-06",
    title: "富文本粘贴转 Markdown",
    items: [
      "从网页或富文本应用粘贴时，自动转换为 Markdown 格式",
      "支持标题、列表、链接、图片、表格等常见 HTML 元素",
    ],
  },
  {
    version: "0.2.13",
    date: "2026-06",
    title: "官网小屏适配",
    items: [
      "小屏设备上 Demo 自适应缩放，交互坐标同步修正",
      "页脚响应式布局优化，窄屏隐藏联系栏目",
    ],
  },
  {
    version: "0.2.12",
    date: "2026-06",
    title: "微信导出修复与官网 Demo",
    items: [
      "修复文档开头空行导致微信公众号导出标题识别失败",
      "官网 Demo 场景按钮增加选中状态",
    ],
  },
  {
    version: "0.2.11",
    date: "2026-06",
    title: "AI 变更快照与超时配置",
    items: [
      "应用 AI 建议或校对修复时记录变更前后快照，保留版本历史",
      "AI 代理请求支持自定义超时（最长 120 秒）",
      "改进 AI 错误报告，展示完整错误链",
    ],
  },
  {
    version: "0.2.10",
    date: "2026-06",
    title: "发布流程修复",
    items: [
      "修复 GitHub Release 发布时产物路径不匹配导致上传失败的问题",
    ],
  },
  {
    version: "0.2.9",
    date: "2026-06",
    title: "Windows 打包支持",
    items: [
      "支持 Windows x64 安装包构建与 GitHub Release 发布",
      "官网下载页开放 Windows 下载",
      "应用内更新支持 Windows 平台",
      "安装包内嵌 WebView2 引导程序，无需单独安装运行时",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-06",
    title: "系统标题栏主题同步",
    items: [
      "切换浅色 / 深色主题时，macOS 系统标题栏同步跟随",
      "跟随系统外观时，系统主题变化会正确更新应用与标题栏",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-06",
    title: "更新弹窗优化",
    items: [
      "发现新版本时使用应用内弹窗确认，替代系统原生对话框",
      "弹窗文案支持国际化，仅提示版本可更新",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-06",
    title: "AI 选区上下文",
    items: [
      "编辑器选区右键可添加到 AI 对话上下文，发送指令时一并参考",
      "AI 面板显示上下文 chip，可随时移除",
      "简化 Agent 任务判断逻辑，由模型自行决定编辑文档或文字回复",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-06",
    title: "AI 桌面代理与设置优化",
    items: [
      "桌面端 AI 请求经 Tauri 代理，规避浏览器 CORS 限制",
      "刷新 AI 提供商目录，移除已弃用模型，启用前需填写 API Key",
      "提供商设置自动保存，设置面板布局优化",
      "文档编辑 Agent 支持研究类工具自动调用",
      "历史指令折叠后仍可操作「应用 / 放弃」按钮",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-06",
    title: "更新体验优化",
    items: [
      "发现新版本时弹窗询问后再下载，不再自动安装",
      "修复设置页检查更新时 Toast 被遮罩层挡住",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-06",
    title: "工具栏标题显示优化",
    items: [
      "文档标题过长时在工具栏单行显示，超出部分以省略号截断",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-06",
    title: "应用内自动更新",
    items: [
      "支持后台检查、下载并安装新版本，完成后一键重启",
      "设置页可开关自动检查，菜单与设置页支持手动检查更新",
      "官网 favicon 与动态版本号展示",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-06",
    title: "工具栏优化",
    items: [
      "排版间距按钮仅在文档确实需要中英文间距格式化时显示",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06",
    title: "AI 与编辑体验增强",
    items: [
      "设置页 AI 分区拆分为「模型」与「工具」两个标签",
      "Agent 结构化文档编辑工具，支持段落级改写与 diff 审阅",
      "编辑器支持拖拽与粘贴插入图片",
      "当前文件可在 Finder 中快速定位",
      "官网新增平台下载选择器，README 补充产品截图",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06",
    title: "首个公开版本",
    items: [
      "macOS 原生 Markdown 编辑器，文件保存在本地磁盘",
      "分屏编辑与实时预览，编辑区与预览区同步滚动",
      "章节大纲面板，点击标题快速跳转",
      "三种视图：分屏、仅编辑、仅预览",
      "AI 段落改写：自然语言指令、diff 审阅、一键应用",
      "导出 PDF、微信公众号 HTML、社交媒体分享卡片与长图",
      "中英文排版间距自动补齐，支持一键格式化全文",
      "历史版本快照，可对比 diff 并恢复",
      "浅色 / 深色主题，界面支持中文与 English",
    ],
  },
];

const CHANGELOG_EN: ChangelogEntry[] = [
  {
    version: "0.2.21",
    date: "2026-06",
    title: "Markdown format bar",
    items: [
      "Add a Markdown format bar above the editor with heading, bold, list, link, and other common tools",
      "Format bar tools can be toggled, reordered, and customized in settings",
      "Move CJK spacing formatting from the toolbar into the format bar",
      "Refine Mac chip detection fallback logic",
    ],
  },
  {
    version: "0.2.20",
    date: "2026-06",
    title: "Mac chip detection and landing SEO",
    items: [
      "Improve Mac chip detection on the download page with Client Hints and WebGL parsing",
      "Default to Apple Silicon when detection is uncertain and guide Intel users to switch manually",
      "Add Open Graph, Twitter Card, structured data, and crawlable static content to the landing page",
      "Harden split pane width localStorage reads",
    ],
  },
  {
    version: "0.2.19",
    date: "2026-06",
    title: "In-editor AI diff preview",
    items: [
      "Preview AI edit diffs in the editor before accepting or discarding",
      "Version history dialog defaults to preview without a previous snapshot and improves min height",
      "Fix editor scroll ratio calculation to account for document padding",
    ],
  },
  {
    version: "0.2.18",
    date: "2026-06",
    title: "Sync scroll and export polish",
    items: [
      "Show persistent toast with open-folder action after saving export images",
      "Fix loose strong marker parsing after punctuation",
      "Add synchronized scrolling and resizable split pane between editor and preview",
      "Fix scroll sync edge cases at content boundaries",
    ],
  },
  {
    version: "0.2.17",
    date: "2026-06",
    title: "Export image inlining fix",
    items: [
      "Inline local images before card and long-image export to fix blank image output",
      "Tag Markdown images with local paths for Tauri filesystem fallback",
      "Add capture retry and theme-aware background colors",
    ],
  },
  {
    version: "0.2.16",
    date: "2026-06",
    title: "Xiaohongshu card media auto-scaling",
    items: [
      "Introduce scalable media blocks to proportionally shrink large images and charts to fit within card space",
      "Optimize card pagination algorithm by using a fixed font size and removing the iterative font-size search loop",
      "Clean up measure surface elements on unmount to prevent memory leaks",
    ],
  },
  {
    version: "0.2.15",
    date: "2026-06",
    title: "Local storage quota management",
    items: [
      "Auto-evict stale localStorage entries and retry when quota is exceeded",
      "Add storage budgets and payload trimming for AI history, versions, and drafts",
    ],
  },
  {
    version: "0.2.14",
    date: "2026-06",
    title: "Rich HTML paste to Markdown",
    items: [
      "Convert rich HTML clipboard content to Markdown on paste",
      "Support headings, lists, links, images, tables, and common HTML elements",
    ],
  },
  {
    version: "0.2.13",
    date: "2026-06",
    title: "Landing page small-screen layout",
    items: [
      "Responsive scaling for the landing demo on narrow viewports with corrected interaction coordinates",
      "Responsive footer layout; hide the contact column on smaller screens",
    ],
  },
  {
    version: "0.2.12",
    date: "2026-06",
    title: "WeChat export fix and landing demo UX",
    items: [
      "Fix WeChat HTML export title detection when the document starts with blank lines",
      "Show active state on landing page demo scenario buttons",
    ],
  },
  {
    version: "0.2.11",
    date: "2026-06",
    title: "AI change snapshots and timeout",
    items: [
      "Record before/after snapshots when applying AI suggestions or proofread fixes",
      "Configurable timeout for AI proxy requests (up to 120 seconds)",
      "Improved AI error reporting with full error chain",
    ],
  },
  {
    version: "0.2.10",
    date: "2026-06",
    title: "Release pipeline fix",
    items: [
      "Fix GitHub Release publish failures caused by mismatched artifact paths",
    ],
  },
  {
    version: "0.2.9",
    date: "2026-06",
    title: "Windows packaging support",
    items: [
      "Build and publish Windows x64 NSIS installers via GitHub Actions",
      "Enable Windows downloads on the landing page",
      "In-app updates now support the Windows platform",
      "Embed the WebView2 bootstrapper so users do not need a separate runtime install",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-06",
    title: "System title bar theme sync",
    items: [
      "Sync the macOS system title bar when switching light or dark theme",
      "Follow system appearance changes for both app UI and title bar",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-06",
    title: "Update prompt improvements",
    items: [
      "Use an in-app dialog instead of the native system prompt when updates are available",
      "Localize update prompt copy and show a concise version notice only",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-06",
    title: "AI selection context",
    items: [
      "Add editor selection to AI conversation context via right-click menu",
      "Show a context chip in the AI panel with one-click removal",
      "Simplify agent task routing so the model chooses edit tools vs chat replies",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-06",
    title: "AI desktop transport and settings",
    items: [
      "Route desktop AI requests through Tauri to avoid browser CORS limits",
      "Refresh AI provider catalog, remove deprecated models, require API keys before enabling",
      "Auto-save provider settings with improved settings panel layout",
      "Document-edit agent can use research tools with automatic tool choice",
      "Keep apply/discard actions visible when instruction cards are collapsed",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-06",
    title: "Update UX improvements",
    items: [
      "Prompt before downloading updates instead of installing automatically",
      "Fix update toasts appearing behind the Settings overlay",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-06",
    title: "Toolbar title display",
    items: [
      "Document title stays on one line in the toolbar with ellipsis when truncated",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-06",
    title: "In-app auto-update",
    items: [
      "Background update checks, downloads, and install with one-click restart",
      "Auto-check toggle in Settings; manual check from menu and Settings",
      "Website favicon and dynamic version display",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-06",
    title: "Toolbar polish",
    items: [
      "Format spacing button only shown when document needs CJK spacing formatting",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06",
    title: "AI and editing improvements",
    items: [
      "Settings AI tab split into Models and Tools",
      "Agent structured document editing with paragraph-level rewrite and diff review",
      "Editor image insertion via drag-and-drop and paste",
      "Reveal current file in Finder",
      "Website platform download picker and README product screenshots",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06",
    title: "First public release",
    items: [
      "Native macOS Markdown editor — files stay on your disk",
      "Split editing and live preview with synchronized scrolling",
      "Outline panel with click-to-jump headings",
      "Three view modes: split, edit-only, preview-only",
      "AI rewriting: natural-language instructions, diff review, one-click apply",
      "Export PDF, WeChat HTML, social share cards, and long images",
      "Automatic CJK spacing with one-click full-document formatting",
      "Version snapshots with diff compare and restore",
      "Light / dark themes; interface in Chinese and English",
    ],
  },
];

export function getChangelog(locale: AppLocale): ChangelogEntry[] {
  return locale === "zh-CN" ? CHANGELOG_ZH : CHANGELOG_EN;
}
