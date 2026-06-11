import type { EditChange } from "../composables/useAI";
import { applyChangesToDoc } from "../composables/useAI";
import { DEMO_MARKDOWN } from "./demoContent";

export const DEMO_AI_INSTRUCTION = "把第二段改得更简洁，保留引用块";

function buildChange(doc: string, search: string, replace: string): EditChange {
  const from = doc.indexOf(search);
  if (from < 0) {
    throw new Error(`Demo AI: search text not found: ${search.slice(0, 40)}`);
  }
  return { from, to: from + search.length, insert: replace };
}

export const DEMO_AI_CHANGES: EditChange[] = [
  buildChange(
    DEMO_MARKDOWN,
    "左侧编辑，右侧用 **Source Serif** 渲染预览，长文阅读更舒适。",
    "左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。",
  ),
  buildChange(
    DEMO_MARKDOWN,
    "> 好的排版让文字呼吸。",
    "> 排版留白，文字才透气。",
  ),
];

export const DEMO_AI_STREAM_RESPONSE =
  "1. 「左侧编辑，右侧用 Source Serif 渲染预览，长文阅读更舒适。」\n" +
  "   →「左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。」\n" +
  "2. 「好的排版让文字呼吸。」→「排版留白，文字才透气。」";

export const DEMO_AI_APPLIED_MARKDOWN = applyChangesToDoc(DEMO_MARKDOWN, DEMO_AI_CHANGES);
