# Sheaf 设计规范

> 从项目代码提取的设计 token 与组件规范。核心定义见 `src/styles/global.css`。

## 1. 设计定位

**产品名：** Sheaf

**核心理念：** 注重排版与留白 —— 「好的排版让文字呼吸；留白不是浪费，是给思考的空间。」

**视觉气质：**

- 暖色纸感背景 + 墨绿强调色，偏编辑/阅读工具，不是 SaaS 仪表盘
- 三字体分工：UI 无衬线、编辑等宽、预览衬线
- 低对比边框、柔和阴影，界面尽量「退后」，让内容居中

---

## 2. 设计 Token（CSS 变量）

所有 token 定义在 `src/styles/global.css`，前缀 `--ink-*`。

### 2.1 色彩 — 浅色（默认）

| Token | 值 | 用途 |
|-------|-----|------|
| `--ink-bg` | `#f7f4ef` | 应用背景 |
| `--ink-bg-editor` | `#faf8f5` | 编辑区背景 |
| `--ink-bg-preview` | `#f7f4ef` | 预览区背景 |
| `--ink-surface` | `#ffffff` | 卡片/工具栏/面板 |
| `--ink-text` | `#2a2520` | 主文字 |
| `--ink-text-muted` | `#8a8278` | 次要文字 |
| `--ink-border` | `rgba(42, 37, 32, 0.08)` | 弱边框 |
| `--ink-border-strong` | `rgba(42, 37, 32, 0.14)` | 强边框 |
| `--ink-accent` | `#3d5a4c` | 强调色（墨绿） |
| `--ink-accent-soft` | `rgba(61, 90, 76, 0.1)` | 悬停/选中背景 |
| `--ink-code-bg` | `rgba(42, 37, 32, 0.05)` | 代码块背景 |
| `--ink-quote-border` | `#c4b8a8` | 引用左边框 |
| `--ink-selection` | `rgba(61, 90, 76, 0.18)` | 文字选中 |
| `--ink-shadow` | `rgba(42, 37, 32, 0.08)` | 阴影 |
| `--ink-link-underline` | `rgba(61, 90, 76, 0.4)` | 链接下划线 |

### 2.2 色彩 — 深色

通过 `[data-theme="dark"]` 切换，主色反转、强调色提亮：

| Token | 深色值 |
|-------|--------|
| `--ink-bg` | `#1a1816` |
| `--ink-bg-editor` | `#1e1c19` |
| `--ink-bg-preview` | `#1a1816` |
| `--ink-surface` | `#242120` |
| `--ink-text` | `#e8e4dc` |
| `--ink-text-muted` | `#9a9288` |
| `--ink-border` | `rgba(232, 228, 220, 0.08)` |
| `--ink-border-strong` | `rgba(232, 228, 220, 0.14)` |
| `--ink-accent` | `#6b9b82` |
| `--ink-accent-soft` | `rgba(107, 155, 130, 0.12)` |
| `--ink-code-bg` | `rgba(232, 228, 220, 0.06)` |
| `--ink-quote-border` | `#5a5348` |
| `--ink-selection` | `rgba(107, 155, 130, 0.25)` |
| `--ink-shadow` | `rgba(0, 0, 0, 0.35)` |
| `--ink-link-underline` | `rgba(107, 155, 130, 0.45)` |

### 2.3 语法高亮

编辑器（CodeMirror）和预览共用一套 syntax token：

| Token | 浅色 | 深色 |
|-------|------|------|
| `--ink-syntax-meta` | `#404740` | `#9a9288` |
| `--ink-syntax-heading` | `#2a2520` | `#e8e4dc` |
| `--ink-syntax-url` | `#1a56db` | `#79c0ff` |
| `--ink-syntax-keyword` | `#7c3aed` | `#d2a8ff` |
| `--ink-syntax-literal` | `#166534` | `#7ee787` |
| `--ink-syntax-string` | `#b91c1c` | `#ff7b72` |
| `--ink-syntax-regexp` | `#c2410c` | `#ffa657` |
| `--ink-syntax-name` | `#1d4ed8` | `#79c0ff` |
| `--ink-syntax-type` | `#047857` | `#56d364` |
| `--ink-syntax-comment` | `#92400e` | `#d4a574` |
| `--ink-syntax-invalid` | `#dc2626` | `#ff6b6b` |

### 2.4 字体

```css
--font-ui:      "IBM Plex Sans", system-ui, sans-serif;
--font-editor:  "IBM Plex Mono", ui-monospace, monospace;
--font-preview: "Source Serif 4", "Songti SC", "SimSun", serif;
```

| 场景 | 字体 | 字重 |
|------|------|------|
| UI / 按钮 / 工具栏 | IBM Plex Sans | 400 / 500 |
| 编辑器 | IBM Plex Mono | 400 / 500 |
| Markdown 预览 / 官网标题 | Source Serif 4 + 中文衬线回退 | 400 / 600 |

Google Fonts 加载见 `index.html`：`IBM Plex Mono`、`IBM Plex Sans`、`Source Serif 4`。

### 2.5 间距

| Token | 值 |
|-------|-----|
| `--space-xs` | `0.5rem` (8px) |
| `--space-sm` | `0.75rem` (12px) |
| `--space-md` | `1.25rem` (20px) |
| `--space-lg` | `2rem` (32px) |
| `--space-xl` | `3rem` (48px) |
| `--content-max` | `42rem` (~672px) — 编辑/预览内容最大宽度 |

---

## 3. 主题机制

- 切换方式：`document.documentElement.dataset.theme = "dark" | "light"`
- 偏好存储：`localStorage["blank-theme"]`，支持 `light` / `dark` / `system`
- 深色模式额外设置 `color-scheme: dark`
- 实现见 `src/composables/useTheme.ts`

---

## 4. 排版规范（Markdown 预览 `.preview-content`）

| 元素 | 规格 |
|------|------|
| 正文 | `1.0625rem` / `line-height: 1.85` / `letter-spacing: 0.01em` |
| 段落间距 | 相邻块 `margin-top: 1.25em` |
| H1 | `2rem` / 600 / 底部分割线 |
| H2 | `1.5rem` / `margin-top: 2em` |
| H3 | `1.2rem` |
| 标题通用 | `line-height: 1.3` / `letter-spacing: -0.02em` |
| 链接 | 强调色 + 下划线 / `text-underline-offset: 3px` |
| 引用 | 左 `3px` 边框 / 斜体 / 次要色 |
| 行内代码 | 等宽 / `0.88em` / `border-radius: 4px` |
| 代码块 | `border-radius: 8px` / `padding: 1.25em 1.5em` |
| 图片 | `max-width: 100%` / `border-radius: 6px` |
| 表格 | 边框 `--ink-border-strong` / 表头 `--ink-code-bg` 背景 |

**内容区布局：** 居中，`max-width: var(--content-max)`，上下 `2.5rem`、左右 `2rem`、底部 `4rem`。

---

## 5. 编辑器规范（CodeMirror）

| 属性 | 值 |
|------|-----|
| 字号 | `15px` |
| 行高 | `1.75` |
| 光标/选中 | `--ink-accent` / `--ink-selection` |
| 当前行 | `--ink-accent-soft` 背景 |
| 行号 | `12px` / 透明度 `0.55` / 右对齐 |
| 内容区 | 同预览，`max-width: 42rem` 居中 |

语法高亮映射见 `src/lib/editorHighlightStyle.ts`，主题见 `src/components/MarkdownEditor.vue`。

---

## 6. 布局结构

```
┌─────────────────────────────────────────────┐
│ Toolbar (48px, --ink-surface)               │
├──────────────────┬──┬───────────────────────┤
│ Editor           ││ │ Preview               │
│ (--ink-bg-editor)│1px│ (--ink-bg-preview)   │
├──────────────────┴──┴───────────┬───────────┤
│                                 │ Outline   │
│                                 │ (220px)   │
│                                 ├───────────┤
│                                 │ AI Panel  │
│                                 │ (280px)   │
└─────────────────────────────────┴───────────┘
```

- 桌面端：`html/body/#app` 固定 `height: 100%` + `overflow: hidden`
- 分屏分隔线：`1px` / `--ink-border-strong`
- 侧边面板：左/右边框 `--ink-border`，固定宽度

---

## 7. 组件样式模式

### 7.1 按钮

| 类型 | 规格 |
|------|------|
| 默认 `.btn` | `padding: 6px 12px` / `13px` / `font-weight: 500` / `border-radius: 6px` |
| Ghost | 次要色文字 / `font-weight: 400` |
| 悬停 | `background: var(--ink-accent-soft)` |
| 禁用 | `opacity: 0.5` |
| 图标按钮 | `32×32px` / `border-radius: 6px` |
| 过渡 | `background 0.15s` |

### 7.2 分段控件（视图切换 / 主题选择）

- 容器：`background: var(--ink-bg)` / `border-radius: 8px` / `padding: 3px`
- 激活项：`background: var(--ink-surface)` + `box-shadow: 0 1px 3px var(--ink-shadow)`

### 7.3 面板头部（大纲 / AI）

- `padding: 12px 16px 10px`
- `font-size: 12px` / `font-weight: 600` / `letter-spacing: 0.04em`
- 次要色 + 底部分割线

### 7.4 输入框

- `padding: 7–8px 10px` / `border-radius: 6–8px`
- 边框 `--ink-border-strong`，聚焦 `--ink-accent`
- 背景 `--ink-bg`
- 等宽字段用 `--font-mono`

### 7.5 设置弹窗

- 遮罩：`rgba(0, 0, 0, 0.25)` + `backdrop-filter: blur(2px)`
- 窗口：`560×420px` max / `border-radius: 12px`
- 阴影：`0 24px 48px var(--ink-shadow)`

### 7.6 AI 面板

- 主按钮：`--ink-accent` 背景 + 白字
- 流式输出区：等宽 `12px` / `--ink-bg` 背景
- 光标动画：`blink 1s step-end infinite`
- 成功态：`color-mix(in srgb, var(--ink-accent) 12%, transparent)`
- 错误态：`color-mix(in srgb, #e53e3e 10%, transparent)`

---

## 8. 官网 Landing Page

在共享 `--ink-*` token 基础上扩展，见 `src/website/landing.css`：

| Token / 规则 | 值 |
|--------------|-----|
| `--landing-max` | `1120px` |
| `--landing-pad` | `clamp(1.25rem, 4vw, 2.5rem)` |
| 导航 | sticky + 毛玻璃 `color-mix 88%` + `blur(12px)` |
| 按钮圆角 | `8px` |
| 卡片圆角 | `14px` |
| Demo 区圆角 | `20px` + 径向渐变 accent-soft |
| CTA 区块 | 反色（`--ink-text` 背景 + `--ink-bg` 文字） |
| Hero 标题 | Source Serif 4 / `clamp(2.25rem, 5.5vw, 3.75rem)` |
| Eyebrow 标签 | 大写 / `12px` / pill 形 `border-radius: 999px` |
| 断点 | `720px` 起三列特性网格 + 显示导航链接 |

官网覆盖桌面端的 `overflow: hidden`，允许整页滚动。

### Landing 按钮变体

| 类名 | 样式 |
|------|------|
| `.landing-btn-ghost` | 次要色，hover 时 accent-soft 背景 |
| `.landing-btn-primary` | 反色填充（text 背景 + bg 文字） |
| `.landing-btn-outline` | 强边框 + hover surface 背景 |

---

## 9. PDF 导出

`.pdf-export-content` 强制浅色印刷样式：

- 固定宽度 `170mm`
- 硬编码 `#ffffff` 背景 / `#2a2520` 文字
- 不受 dark theme 影响

---

## 10. 交互与动效

| 规则 | 值 |
|------|-----|
| 通用过渡 | `0.15s`（background / color / border-color / opacity / box-shadow） |
| 按钮 hover 主色 | `opacity: 0.88`（官网 primary）或 `opacity: 0.85`（AI 按钮） |
| 文字选中 | `::selection { background: var(--ink-selection) }` |
| 字体渲染 | `-webkit-font-smoothing: antialiased` |

---

## 11. 命名约定

- **设计系统前缀：** `--ink-*`（墨水/纸感）
- **Landing 前缀：** `--landing-*`
- **组件 class 前缀：** 按功能命名（`.toolbar-*`、`.ai-*`、`.outline-*`、`.landing-*`）
- **主题属性：** `data-theme="dark"` 挂在 `<html>`

---

## 12. 文件索引

| 文件 | 职责 |
|------|------|
| `src/styles/global.css` | Token 定义、预览排版、PDF 样式 |
| `src/lib/editorHighlightStyle.ts` | 编辑器语法高亮映射 |
| `src/components/MarkdownEditor.vue` | 编辑器 CodeMirror 主题 |
| `src/components/MarkdownPreview.vue` | 预览区布局 |
| `src/components/Toolbar.vue` | 工具栏组件样式 |
| `src/components/OutlinePanel.vue` | 大纲面板 |
| `src/components/AIPanel.vue` | AI 面板 |
| `src/components/SettingsPanel.vue` | 设置弹窗 |
| `src/website/landing.css` | 官网页面样式 |
| `src/composables/useTheme.ts` | 主题切换逻辑 |
| `index.html` | 字体加载 |
