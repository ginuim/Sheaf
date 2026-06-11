import type { EditChange } from "../composables/useAI";
import { applyChangesToDoc } from "../composables/useAI";
import type { AppLocale } from "../i18n";
import { getDemoMarkdown } from "./demoContent";

export const DEMO_AI_INSTRUCTION = "把第二段改得更简洁，保留引用块";

function buildChange(doc: string, search: string, replace: string): EditChange {
  const from = doc.indexOf(search);
  if (from < 0) {
    throw new Error(`Demo AI: search text not found: ${search.slice(0, 40)}`);
  }
  return { from, to: from + search.length, insert: replace };
}

const DEMO_AI_DATA_ZH = {
  instruction: "把第二段改得更简洁，保留引用块",
  changes: [
    {
      search: "左侧编辑，右侧用 **Source Serif** 渲染预览，长文阅读更舒适。",
      replace: "左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。",
    },
    {
      search: "> 好的排版让文字呼吸。",
      replace: "> 排版留白，文字才透气。",
    },
  ],
  streamResponse:
    "1. 「左侧编辑，右侧用 Source Serif 渲染预览，长文阅读更舒适。」\n" +
    "   →「左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。」\n" +
    "2. 「好的排版让文字呼吸。」→「排版留白，文字才透气。」",
};

const DEMO_AI_DATA_EN = {
  instruction: "Make the second paragraph more concise; keep the blockquote.",
  changes: [
    {
      search: "Edit on the left; preview renders in **Source Serif** on the right for comfortable long reads.",
      replace: "Write Markdown on the left; see instant preview on the right — easier on the eyes for long reads.",
    },
    {
      search: "> Good typography lets text breathe.",
      replace: "> Whitespace in typography lets text breathe.",
    },
  ],
  streamResponse:
    "1. \"Edit on the left; preview renders in Source Serif on the right for comfortable long reads.\"\n" +
    "   → \"Write Markdown on the left; see instant preview on the right — easier on the eyes for long reads.\"\n" +
    "2. \"Good typography lets text breathe.\" → \"Whitespace in typography lets text breathe.\"",
};

export type DemoAiData = {
  instruction: string;
  changes: EditChange[];
  streamResponse: string;
  markdown: string;
};

function buildDemoAiData(locale: AppLocale): DemoAiData {
  const markdown = getDemoMarkdown(locale);
  const source = locale === "zh-CN" ? DEMO_AI_DATA_ZH : DEMO_AI_DATA_EN;
  const changes = source.changes.map(({ search, replace }) => buildChange(markdown, search, replace));
  return {
    instruction: source.instruction,
    changes,
    streamResponse: source.streamResponse,
    markdown,
  };
}

export function getDemoAiInstruction(locale: AppLocale): string {
  return buildDemoAiData(locale).instruction;
}

export function getDemoAiData(locale: AppLocale): DemoAiData {
  return buildDemoAiData(locale);
}

const defaultDemoAiData = buildDemoAiData("zh-CN");

export const DEMO_AI_CHANGES: EditChange[] = defaultDemoAiData.changes;
export const DEMO_AI_STREAM_RESPONSE = defaultDemoAiData.streamResponse;
export const DEMO_AI_APPLIED_MARKDOWN = applyChangesToDoc(
  defaultDemoAiData.markdown,
  defaultDemoAiData.changes,
);
