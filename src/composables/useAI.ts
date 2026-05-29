import { reactive, watch } from "vue";

const SETTINGS_KEY = "blank.ai-settings";

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface EditChange {
  from: number;
  to: number;
  insert: string;
}

const DEFAULT_SETTINGS: AISettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
};

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: AISettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const SYSTEM_PROMPT = `你是一个 Markdown 文档编辑助手。
根据用户指令修改文档内容，只输出修改块，不要输出任何解释文字。
每个修改用以下格式（SEARCH 部分必须是文档中存在的完整连续文字）：

<<<<<<< SEARCH
原文中需要修改的文字
=======
修改后的新文字
>>>>>>> REPLACE

若无需修改，输出：NO_CHANGES`;

function parseBlocks(text: string): Array<{ search: string; replace: string }> {
  const blocks: Array<{ search: string; replace: string }> = [];
  const parts = text.split("<<<<<<< SEARCH\n");
  for (let i = 1; i < parts.length; i++) {
    const sepIdx = parts[i].indexOf("\n=======\n");
    if (sepIdx === -1) continue;
    const endIdx = parts[i].indexOf("\n>>>>>>> REPLACE", sepIdx);
    if (endIdx === -1) continue;
    const search = parts[i].slice(0, sepIdx);
    const replace = parts[i].slice(sepIdx + "\n=======\n".length, endIdx);
    if (search.length > 0) blocks.push({ search, replace });
  }
  return blocks;
}

function blocksToChanges(doc: string, blocks: Array<{ search: string; replace: string }>): EditChange[] {
  const changes: EditChange[] = [];
  for (const block of blocks) {
    const idx = doc.indexOf(block.search);
    if (idx === -1) continue;
    changes.push({ from: idx, to: idx + block.search.length, insert: block.replace });
  }
  changes.sort((a, b) => a.from - b.from);
  return changes;
}

export function useAI() {
  const settings = reactive(loadSettings());

  watch(settings, (s) => saveSettings(s), { deep: true });

  async function streamEdit(
    instruction: string,
    doc: string,
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<EditChange[]> {
    if (!settings.apiKey) throw new Error("请先在设置中填写 API Key");

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `文档内容:\n\`\`\`\n${doc}\n\`\`\`\n\n修改指令: ${instruction}`,
          },
        ],
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API 错误 ${res.status}: ${errText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            onChunk(delta);
          }
        } catch {
          // 忽略不完整的 JSON chunk
        }
      }
    }

    const blocks = parseBlocks(accumulated);
    return blocksToChanges(doc, blocks);
  }

  return { settings, streamEdit };
}
