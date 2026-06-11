export type LegalSection = {
  title: string;
  paragraphs: string[];
  list?: string[];
};

export const PRIVACY_POLICY: LegalSection[] = [
  {
    title: "概述",
    paragraphs: [
      "Sheaf 由 reaidea 开发，是一款本地优先的 Markdown 编辑器。我们尊重你的隐私，不会收集、出售或共享你的个人数据。",
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

export const TERMS_OF_SERVICE: LegalSection[] = [
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
      "reaidea 授予你在个人或商业用途下安装和使用 Sheaf 的非独占、不可转让许可。你不得对软件进行逆向工程、反编译，或移除版权声明。",
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
      "AI 改写、网页搜索（若启用）等功能依赖第三方 API，由你自行配置并承担相应费用与条款约束。reaidea 不对第三方服务的可用性、准确性或数据处理行为负责。",
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
