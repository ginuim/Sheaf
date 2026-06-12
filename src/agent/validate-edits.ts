import type { EditChange } from "../composables/useAI";

export type ValidateEditsResult =
  | { ok: true; changes: EditChange[] }
  | { ok: false; error: string };

export function validateEditChanges(doc: string, raw: EditChange[]): ValidateEditsResult {
  if (raw.length === 0) {
    return { ok: false, error: "未提供任何修改" };
  }

  const changes: EditChange[] = [];
  for (const item of raw) {
    if (!Number.isInteger(item.from) || !Number.isInteger(item.to)) {
      return { ok: false, error: "from/to 必须是整数" };
    }
    if (item.from < 0 || item.to < 0 || item.from > doc.length || item.to > doc.length) {
      return { ok: false, error: `修改范围越界（文档长度 ${doc.length}）` };
    }
    if (item.from > item.to) {
      return { ok: false, error: "from 不能大于 to" };
    }
    if (typeof item.insert !== "string") {
      return { ok: false, error: "insert 必须是字符串" };
    }
    changes.push({ from: item.from, to: item.to, insert: item.insert });
  }

  const sorted = [...changes].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from < sorted[i - 1].to) {
      return { ok: false, error: "修改区间不能重叠" };
    }
  }

  const unchanged = sorted.every((c) => doc.slice(c.from, c.to) === c.insert);
  if (unchanged) {
    return { ok: false, error: "修改后与原文相同" };
  }

  return { ok: true, changes: sorted };
}
