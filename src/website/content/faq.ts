import type { AppLocale } from "../../i18n";

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQ_ZH: FaqItem[] = [
  {
    id: "what",
    question: "Sheaf 适合写什么样的内容？",
    answer:
      "长文写作是它的主场：技术文档、论文草稿、产品说明、读书笔记、博客文章。分屏实时预览让你在写的时候就能看到最终排版；大纲面板帮你在万字稿里快速跳转，不用来回滚动找章节。",
  },
  {
    id: "diff",
    question: "和 Typora、Obsidian 有什么不同？",
    answer:
      "Sheaf 不追求「全能笔记库」，而是专注「写好一篇稿子」。衬线预览 + 等宽编辑的分屏体验、AI 改写前先审 diff、以及一键导出公众号 HTML / 小红书卡片——这些是它和其他编辑器的核心差异。文件就是普通 .md，没有私有格式锁定。",
  },
  {
    id: "privacy",
    question: "需要注册账号吗？文稿存在哪里？",
    answer:
      "不需要账号，也没有云端同步。你打开的 .md 文件保存在自己的磁盘上，设置和版本历史也在本地。AI 请求走你自己配置的 API Key，Sheaf 不托管你的文稿内容。",
  },
  {
    id: "ai",
    question: "AI 会直接改我的文稿吗？",
    answer:
      "不会。AI 返回的是修改建议，你在 diff 视图里逐条审阅，满意了才点「应用」。每次应用前还会自动存一份版本快照，随时可以对比 diff 或回滚——AI 是助手，决定权在你手里。",
  },
  {
    id: "export",
    question: "写完能导出到哪里？",
    answer:
      "预览区看到什么，导出就是什么。支持 PDF（系统打印）、微信公众号 HTML（样式已内联，粘贴即用）、小红书分享卡片和长图。中英文混排会自动补齐间距，公式和 Mermaid 图表也能正确渲染。",
  },
  {
    id: "images",
    question: "插入图片会保存在哪里？",
    answer:
      "默认保存到 Markdown 文件所在目录的相对路径。也可以在设置里启用图床：拖拽、粘贴或选择图片时自动上传到七牛、阿里云 OSS、腾讯云 COS 或 AWS S3，文稿里直接写入公网 URL。适合要发公众号、博客等需要外链图片的场景。",
  },
  {
    id: "platform",
    question: "支持哪些平台？",
    answer:
      "目前已提供 macOS（Apple 芯片 / Intel）和 Windows 安装包，可在本页下载区选择。Linux 版本在计划中。应用内支持自动检查更新，有新版本会提示你确认后再安装。",
  },
  {
    id: "providers",
    question: "AI 用什么模型？要额外付费吗？",
    answer:
      "Sheaf 本身免费开源（AGPL-3.0）。AI 功能需要你在设置里填入自己的 API Key，支持 MiniMax、通义千问，以及任何 OpenAI 兼容接口。模型费用按你所选服务商的定价结算，Sheaf 不代收。",
  },
];

const FAQ_EN: FaqItem[] = [
  {
    id: "what",
    question: "What is Sheaf best for?",
    answer:
      "Long-form writing: technical docs, paper drafts, product specs, reading notes, and blog posts. Split live preview shows final typography as you type; the outline panel lets you jump between sections in multi-thousand-word documents without endless scrolling.",
  },
  {
    id: "diff",
    question: "How is Sheaf different from Typora or Obsidian?",
    answer:
      "Sheaf is not a full knowledge base — it focuses on finishing one piece of writing. Serif preview with monospace editing, diff review before any AI edit, and one-click export to rich HTML for blogs and newsletters are the core differences. Your files stay plain .md with no proprietary lock-in.",
  },
  {
    id: "privacy",
    question: "Do I need an account? Where are my files stored?",
    answer:
      "No account and no cloud sync. Your .md files stay on disk; settings and version history are local too. AI requests use your own API keys — Sheaf does not host your document content.",
  },
  {
    id: "ai",
    question: "Will AI change my document without asking?",
    answer:
      "No. AI returns suggestions you review in a diff view; you apply only what you accept. A version snapshot is saved before each apply, so you can compare diffs or roll back anytime. AI assists — you decide.",
  },
  {
    id: "export",
    question: "Where can I export my writing?",
    answer:
      "What you see in preview is what you export. PDF via the system print dialog; rich HTML with inlined styles you can paste into Medium, Substack, WordPress, Ghost, or similar; plus social share cards and long images. CJK spacing, KaTeX math, and Mermaid diagrams render correctly in exports.",
  },
  {
    id: "images",
    question: "Where do inserted images go?",
    answer:
      "By default, images save relative to your Markdown file. You can also enable image hosting in Settings: drag, paste, or pick an image and it uploads to Qiniu, Aliyun OSS, Tencent COS, or AWS S3, with the public URL inserted into your document. Handy for blog posts, newsletters, or anywhere that needs hosted images.",
  },
  {
    id: "platform",
    question: "Which platforms are supported?",
    answer:
      "macOS (Apple Silicon and Intel) and Windows installers are available on this page. Linux builds are planned. In-app update checks notify you when a new version is ready — you confirm before downloading.",
  },
  {
    id: "providers",
    question: "Which AI models does Sheaf use? Is there a subscription?",
    answer:
      "Sheaf is free and open source (AGPL-3.0). AI features require your own API key in Settings — MiniMax, Qwen, or any OpenAI-compatible endpoint. Model costs follow your provider's pricing; Sheaf does not charge for AI usage.",
  },
];

export function getFaqItems(locale: AppLocale): FaqItem[] {
  return locale === "zh-CN" ? FAQ_ZH : FAQ_EN;
}
