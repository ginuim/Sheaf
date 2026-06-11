import type { AppLocale } from "../../i18n";

const REAIDEA_URL = "https://reaidea.com/";
const REAIDEA_LINK = `<a href="${REAIDEA_URL}" target="_blank" rel="noopener noreferrer" class="legal-link">reaidea</a>`;

export type LegalSection = {
  title: string;
  paragraphs: string[];
  list?: string[];
};

const PRIVACY_POLICY_ZH: LegalSection[] = [
  {
    title: "概述",
    paragraphs: [
      `Sheaf 由 ${REAIDEA_LINK} 开发，是一款本地优先的 Markdown 编辑器。我们尊重你的隐私，不会收集、出售或共享你的个人数据。`,
      "最后更新：2026 年 6 月",
    ],
  },
  {
    title: "我们不收集什么",
    paragraphs: ["Sheaf 没有账号系统，也不运行用户行为追踪或统计分析。我们不会收集："],
    list: [
      "姓名、邮箱、电话号码等身份信息",
      "你撰写的文稿内容",
      "文件路径以外的设备标识或浏览记录",
      "用于广告或用户画像的数据",
    ],
  },
  {
    title: "数据存储位置",
    paragraphs: [
      "你的 Markdown 文件保存在本机磁盘，由你自行管理。应用设置、最近文档列表、AI 对话记录与版本快照均存储在本地，不会上传至我们的服务器。",
    ],
  },
  {
    title: "AI 功能",
    paragraphs: [
      "若你启用 AI 改写，需在设置中自行填写第三方服务商的 API Key。文稿片段会按你的指令发送至你所选择的服务商（如 MiniMax、通义千问等），我们不会中转、存储或查看这些内容。",
      "请同时查阅所使用 AI 服务商的隐私政策，了解其如何处理请求数据。",
    ],
  },
  {
    title: "官网",
    paragraphs: [
      "本网站仅用于产品介绍与下载指引，不使用追踪 Cookie 或第三方分析工具。",
    ],
  },
  {
    title: "联系我们",
    paragraphs: [
      "如对隐私政策有疑问，请发送邮件至 webmaster@reaidea.com。",
    ],
  },
];

const PRIVACY_POLICY_EN: LegalSection[] = [
  {
    title: "Overview",
    paragraphs: [
      `Sheaf is developed by ${REAIDEA_LINK}, a local-first Markdown editor. We respect your privacy and do not collect, sell, or share your personal data.`,
      "Last updated: June 2026",
    ],
  },
  {
    title: "What we do not collect",
    paragraphs: [
      "Sheaf has no account system and does not run user behavior tracking or analytics. We do not collect:",
    ],
    list: [
      "Identity information such as name, email, or phone number",
      "The content of your documents",
      "Device identifiers or browsing history beyond file paths",
      "Data for advertising or profiling",
    ],
  },
  {
    title: "Where data is stored",
    paragraphs: [
      "Your Markdown files live on your local disk under your control. App settings, recent documents, AI chat history, and version snapshots are also stored locally — nothing is uploaded to our servers.",
    ],
  },
  {
    title: "AI features",
    paragraphs: [
      "If you enable AI rewriting, you provide your own third-party API key in Settings. Document excerpts are sent to the provider you choose (e.g. MiniMax, Qwen) according to your instructions. We do not relay, store, or inspect that content.",
      "Please also review the privacy policy of your AI provider to understand how they handle request data.",
    ],
  },
  {
    title: "This website",
    paragraphs: [
      "This site is for product information and downloads only. We do not use tracking cookies or third-party analytics.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions about this policy? Email webmaster@reaidea.com.",
    ],
  },
];

const TERMS_OF_SERVICE_ZH: LegalSection[] = [
  {
    title: "接受条款",
    paragraphs: [
      "下载、安装或使用 Sheaf，即表示你同意本服务条款。如不同意，请勿使用本软件。",
      "最后更新：2026 年 6 月",
    ],
  },
  {
    title: "软件许可",
    paragraphs: [
      `${REAIDEA_LINK} 授予你在个人或商业用途下安装和使用 Sheaf 的非独占、不可转让许可。你不得对软件进行逆向工程、反编译，或移除版权声明。`,
    ],
  },
  {
    title: "你的内容",
    paragraphs: [
      "你对使用 Sheaf 创建、编辑和保存的所有文稿保留完整所有权。我们不会访问、复制或主张对你内容的任何权利。",
    ],
  },
  {
    title: "本地存储与备份",
    paragraphs: [
      "Sheaf 不会自动将你的文件同步至云端。请自行做好备份，避免因设备故障、误删或系统问题造成数据丢失。",
    ],
  },
  {
    title: "第三方服务",
    paragraphs: [
      `AI 改写、网页搜索（若启用）等功能依赖第三方 API，由你自行配置并承担相应费用与条款约束。${REAIDEA_LINK} 不对第三方服务的可用性、准确性或数据处理行为负责。`,
    ],
  },
  {
    title: "免责声明",
    paragraphs: [
      "Sheaf 按「现状」提供，不附带任何明示或暗示的保证。我们不保证软件完全无错误，也不对因使用或无法使用本软件造成的任何直接或间接损失承担责任。",
    ],
  },
  {
    title: "条款变更",
    paragraphs: [
      "我们可能不时更新本条款，并在官网公布。继续使用 Sheaf 即视为接受修订后的条款。",
    ],
  },
  {
    title: "联系我们",
    paragraphs: [
      "如有疑问，请发送邮件至 webmaster@reaidea.com。",
    ],
  },
];

const TERMS_OF_SERVICE_EN: LegalSection[] = [
  {
    title: "Acceptance",
    paragraphs: [
      "By downloading, installing, or using Sheaf, you agree to these Terms of Service. If you do not agree, do not use the software.",
      "Last updated: June 2026",
    ],
  },
  {
    title: "License",
    paragraphs: [
      `${REAIDEA_LINK} grants you a non-exclusive, non-transferable license to install and use Sheaf for personal or commercial purposes. You may not reverse engineer, decompile, or remove copyright notices.`,
    ],
  },
  {
    title: "Your content",
    paragraphs: [
      "You retain full ownership of all documents you create, edit, and save with Sheaf. We do not access, copy, or claim any rights to your content.",
    ],
  },
  {
    title: "Local storage & backups",
    paragraphs: [
      "Sheaf does not automatically sync your files to the cloud. Please maintain your own backups to avoid data loss from device failure, accidental deletion, or system issues.",
    ],
  },
  {
    title: "Third-party services",
    paragraphs: [
      `AI rewriting, web search (if enabled), and similar features rely on third-party APIs that you configure yourself. You are responsible for associated costs and terms. ${REAIDEA_LINK} is not liable for third-party availability, accuracy, or data handling.`,
    ],
  },
  {
    title: "Disclaimer",
    paragraphs: [
      "Sheaf is provided \"as is\" without warranties of any kind. We do not guarantee the software is error-free and are not liable for any direct or indirect damages from use or inability to use the software.",
    ],
  },
  {
    title: "Changes",
    paragraphs: [
      "We may update these terms from time to time and publish revisions on this website. Continued use of Sheaf constitutes acceptance of the updated terms.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions? Email webmaster@reaidea.com.",
    ],
  },
];

export function getPrivacyPolicy(locale: AppLocale): LegalSection[] {
  return locale === "zh-CN" ? PRIVACY_POLICY_ZH : PRIVACY_POLICY_EN;
}

export function getTermsOfService(locale: AppLocale): LegalSection[] {
  return locale === "zh-CN" ? TERMS_OF_SERVICE_ZH : TERMS_OF_SERVICE_EN;
}
