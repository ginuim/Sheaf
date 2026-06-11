export type DocSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  list?: string[];
  table?: { label: string; keys: string }[];
};

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "start",
    title: "快速开始",
    paragraphs: [
      "下载并安装 Sheaf 后，从开始页新建空白文档，或打开本地 .md 文件。",
      "左侧是 Markdown 编辑区（等宽字体），右侧是衬线排版的实时预览。首次打开会载入示例文稿，可直接覆盖开始写作。",
    ],
    list: [
      "新建：工具栏「+」或 ⌘N",
      "打开：工具栏文件夹图标或 ⌘O",
      "保存：⌘S；另存为 ⌘⇧S",
    ],
  },
  {
    id: "edit",
    title: "编辑与预览",
    paragraphs: [
      "工具栏右侧可切换分屏、仅编辑、仅预览三种视图。大纲面板列出文档中的标题层级，点击即可定位。",
      "预览支持标准 Markdown、代码高亮、数学公式（KaTeX）、Mermaid 图表等常见语法。",
    ],
    list: [
      "搜索：⌘F",
      "替换：⌘H",
      "返回上一文档：⌘[",
      "格式化中英文间距：⌘⇧Space（也可在「编辑」菜单中操作）",
    ],
  },
  {
    id: "ai",
    title: "AI 改写",
    paragraphs: [
      "点击工具栏「AI」或按 ⌘⇧A 打开 AI 面板。用自然语言描述修改意图，例如「把第二段改得更口语化」或「检查错别字」。",
      "AI 返回修改建议后会展示 diff，确认无误后点击「应用」写入正文。每次应用前会自动保存版本快照，可在历史版本中回溯。",
      "使用前请在「设置 → AI」中启用服务商并填写 API Key。支持 MiniMax、通义千问等，也可添加自定义 OpenAI 兼容接口。",
    ],
  },
  {
    id: "export",
    title: "导出",
    paragraphs: [
      "工具栏「导出」菜单提供多种输出方式，均基于当前预览排版生成。",
    ],
    list: [
      "导出到社交媒体：生成微信公众号 HTML、小红书分享卡片或长图，样式已内联可直接粘贴或保存",
      "导出 PDF：打开系统打印对话框，选择「存储为 PDF」",
      "复制公众号 HTML：「文件」菜单中也可一键复制",
    ],
  },
  {
    id: "settings",
    title: "设置",
    paragraphs: [
      "⌘, 打开设置。外观页可切换浅色 / 深色 / 跟随系统，以及界面语言。",
      "「中英文间距」开启后，预览、导出和 PDF 会在中文与英文、数字之间自动补齐排版间隙。",
    ],
  },
  {
    id: "shortcuts",
    title: "快捷键",
    table: [
      { label: "新建文档", keys: "⌘N" },
      { label: "打开文件", keys: "⌘O" },
      { label: "保存", keys: "⌘S" },
      { label: "另存为", keys: "⌘⇧S" },
      { label: "搜索", keys: "⌘F" },
      { label: "替换", keys: "⌘H" },
      { label: "格式化中英文间距", keys: "⌘⇧Space" },
      { label: "切换 AI 面板", keys: "⌘⇧A" },
      { label: "返回上一文档", keys: "⌘[" },
      { label: "设置", keys: "⌘," },
    ],
  },
];
