export type WechatThemeId = "classic" | "editorial" | "minimal";

export interface WechatTheme {
  id: WechatThemeId;
  label: string;
  description: string;
  styles: Record<string, string>;
}

const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const FONT_SERIF = '"Songti SC", "STSong", "SimSun", Georgia, serif';
const FONT_MONO = '"Menlo", "Consolas", "IBM Plex Mono", monospace';

// 对齐主界面 .preview-content table：锁住栏宽，单元格按字符换行，避免长 URL / 代码把表撑出公众号栏。
const TABLE_LAYOUT =
  "width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; box-sizing: border-box;";
const TABLE_CELL_WRAP =
  "overflow-wrap: anywhere; word-break: normal; word-wrap: break-word; box-sizing: border-box;";

export const WECHAT_THEMES: WechatTheme[] = [
  {
    id: "classic",
    label: "经典墨绿",
    description: "Sheaf 默认风格，暖色纸感 + 墨绿强调",
    styles: {
      section: `font-family: ${FONT_SANS}; font-size: 16px; line-height: 1.85; color: #2a2520; letter-spacing: 0.01em; word-wrap: break-word;`,
      h1: `font-size: 22px; font-weight: 600; line-height: 1.3; letter-spacing: -0.02em; color: #2a2520; margin: 0 0 24px; padding-bottom: 10px; border-bottom: 1px solid rgba(42, 37, 32, 0.14);`,
      h2: `font-size: 18px; font-weight: 600; line-height: 1.3; letter-spacing: -0.02em; color: #3d5a4c; margin: 32px 0 16px;`,
      h3: `font-size: 16px; font-weight: 600; line-height: 1.3; color: #2a2520; margin: 24px 0 12px;`,
      h4: `font-size: 15px; font-weight: 600; line-height: 1.3; color: #2a2520; margin: 20px 0 10px;`,
      p: `margin: 0 0 20px; text-align: justify; line-height: 1.85;`,
      blockquote: `margin: 0 0 20px; padding: 8px 0 8px 16px; border-left: 3px solid #c4b8a8; color: #8a8278; font-style: italic; line-height: 1.75;`,
      ul: `margin: 0 0 20px; padding-left: 24px; list-style-type: disc;`,
      ol: `margin: 0 0 20px; padding-left: 24px; list-style-type: decimal;`,
      li: `margin: 0 0 8px; line-height: 1.75;`,
      a: `color: #3d5a4c; text-decoration: underline;`,
      strong: `font-weight: 600; color: #2a2520;`,
      em: `font-style: italic;`,
      code: `font-family: ${FONT_MONO}; font-size: 14px; background-color: rgba(42, 37, 32, 0.06); padding: 2px 6px; border-radius: 4px;`,
      codeInPre: `font-family: ${FONT_MONO}; font-size: 14px; background: none; padding: 0; border-radius: 0;`,
      pre: `font-family: ${FONT_MONO}; font-size: 14px; background-color: rgba(42, 37, 32, 0.06); padding: 16px 20px; border-radius: 8px; margin: 0 0 20px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto;`,
      hr: `border: none; border-top: 1px solid rgba(42, 37, 32, 0.14); margin: 32px 0; height: 0;`,
      img: `max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 6px;`,
      table: `${TABLE_LAYOUT} margin: 0 0 20px; font-size: 15px;`,
      th: `border: 1px solid rgba(42, 37, 32, 0.14); padding: 8px 12px; text-align: left; background-color: rgba(42, 37, 32, 0.05); font-weight: 500; ${TABLE_CELL_WRAP}`,
      td: `border: 1px solid rgba(42, 37, 32, 0.14); padding: 8px 12px; text-align: left; ${TABLE_CELL_WRAP}`,
    },
  },
  {
    id: "editorial",
    label: "编辑精选",
    description: "衬线标题 + 左侧装饰线，杂志感",
    styles: {
      section: `font-family: ${FONT_SANS}; font-size: 16px; line-height: 1.85; color: #1a1816; letter-spacing: 0.01em; word-wrap: break-word;`,
      h1: `font-family: ${FONT_SERIF}; font-size: 24px; font-weight: 600; line-height: 1.35; color: #1a1816; margin: 0 0 28px; text-align: center;`,
      h2: `font-family: ${FONT_SERIF}; font-size: 18px; font-weight: 600; line-height: 1.35; color: #1a1816; margin: 36px 0 16px; padding-left: 12px; border-left: 4px solid #2a2520;`,
      h3: `font-size: 16px; font-weight: 600; line-height: 1.35; color: #2a2520; margin: 28px 0 12px;`,
      h4: `font-size: 15px; font-weight: 600; line-height: 1.35; color: #2a2520; margin: 20px 0 10px;`,
      p: `margin: 0 0 20px; text-align: justify; line-height: 1.9;`,
      blockquote: `margin: 0 0 20px; padding: 12px 16px; background-color: rgba(42, 37, 32, 0.04); border-left: 4px solid #2a2520; color: #5a5348; font-style: normal; line-height: 1.75;`,
      ul: `margin: 0 0 20px; padding-left: 24px; list-style-type: disc;`,
      ol: `margin: 0 0 20px; padding-left: 24px; list-style-type: decimal;`,
      li: `margin: 0 0 8px; line-height: 1.75;`,
      a: `color: #1a1816; text-decoration: underline; text-underline-offset: 3px;`,
      strong: `font-weight: 600; color: #1a1816;`,
      em: `font-style: italic;`,
      code: `font-family: ${FONT_MONO}; font-size: 14px; background-color: rgba(26, 24, 22, 0.06); padding: 2px 6px; border-radius: 3px;`,
      codeInPre: `font-family: ${FONT_MONO}; font-size: 14px; background: none; padding: 0; border-radius: 0;`,
      pre: `font-family: ${FONT_MONO}; font-size: 14px; background-color: rgba(26, 24, 22, 0.06); padding: 16px 20px; border-radius: 4px; margin: 0 0 20px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto;`,
      hr: `border: none; border-top: 2px solid #2a2520; margin: 36px auto; width: 60px; height: 0;`,
      img: `max-width: 100%; height: auto; display: block; margin: 20px auto;`,
      table: `${TABLE_LAYOUT} margin: 0 0 20px; font-size: 15px;`,
      th: `border: 1px solid rgba(26, 24, 22, 0.2); padding: 8px 12px; text-align: left; background-color: rgba(26, 24, 22, 0.06); font-weight: 600; ${TABLE_CELL_WRAP}`,
      td: `border: 1px solid rgba(26, 24, 22, 0.2); padding: 8px 12px; text-align: left; ${TABLE_CELL_WRAP}`,
    },
  },
  {
    id: "minimal",
    label: "极简留白",
    description: "黑白灰、大留白，干净克制",
    styles: {
      section: `font-family: ${FONT_SANS}; font-size: 16px; line-height: 2; color: #333333; letter-spacing: 0.02em; word-wrap: break-word;`,
      h1: `font-size: 20px; font-weight: 500; line-height: 1.4; color: #111111; margin: 0 0 32px;`,
      h2: `font-size: 17px; font-weight: 500; line-height: 1.4; color: #111111; margin: 40px 0 16px;`,
      h3: `font-size: 16px; font-weight: 500; line-height: 1.4; color: #333333; margin: 32px 0 12px;`,
      h4: `font-size: 15px; font-weight: 500; line-height: 1.4; color: #333333; margin: 24px 0 10px;`,
      p: `margin: 0 0 24px; text-align: left; line-height: 2; color: #333333;`,
      blockquote: `margin: 0 0 24px; padding: 0 0 0 16px; border-left: 2px solid #cccccc; color: #888888; font-style: normal; line-height: 1.85;`,
      ul: `margin: 0 0 24px; padding-left: 20px; list-style-type: disc;`,
      ol: `margin: 0 0 24px; padding-left: 20px; list-style-type: decimal;`,
      li: `margin: 0 0 10px; line-height: 1.85; color: #333333;`,
      a: `color: #111111; text-decoration: underline;`,
      strong: `font-weight: 600; color: #111111;`,
      em: `font-style: italic; color: #555555;`,
      code: `font-family: ${FONT_MONO}; font-size: 14px; background-color: #f5f5f5; padding: 2px 6px; border-radius: 3px; color: #333333;`,
      codeInPre: `font-family: ${FONT_MONO}; font-size: 14px; background: none; padding: 0; border-radius: 0; color: #333333;`,
      pre: `font-family: ${FONT_MONO}; font-size: 14px; background-color: #f5f5f5; padding: 16px; border-radius: 4px; margin: 0 0 24px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto; color: #333333;`,
      hr: `border: none; border-top: 1px solid #eeeeee; margin: 40px 0; height: 0;`,
      img: `max-width: 100%; height: auto; display: block; margin: 24px auto;`,
      table: `${TABLE_LAYOUT} margin: 0 0 24px; font-size: 15px;`,
      th: `border: 1px solid #eeeeee; padding: 8px 12px; text-align: left; background-color: #fafafa; font-weight: 500; color: #111111; ${TABLE_CELL_WRAP}`,
      td: `border: 1px solid #eeeeee; padding: 8px 12px; text-align: left; color: #333333; ${TABLE_CELL_WRAP}`,
    },
  },
];

export function getWechatTheme(id: WechatThemeId): WechatTheme {
  return WECHAT_THEMES.find((t) => t.id === id) ?? WECHAT_THEMES[0];
}
