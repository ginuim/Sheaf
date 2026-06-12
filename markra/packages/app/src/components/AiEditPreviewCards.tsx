import { ChevronDown, FileDiff, LocateFixed } from "lucide-react";
import type { AiAgentSessionPreview } from "@markra/ai";
import {
  compressDiff,
  lineDiff,
  summarizeDiffLines,
  type CompressedDiffLine,
  type I18nKey
} from "@markra/shared";
import { previewSummarySnippet, previewTargetLabel } from "../lib/ai-edit-session";
import type { AiEditHistoryEntry } from "../lib/ai-edit-session";

type AiEditPreviewCardsProps = {
  entries: AiEditHistoryEntry[];
  expandedEntryId?: string | null;
  showUserPrompt?: boolean;
  translate: (key: I18nKey) => string;
  onExpandedEntryIdChange?: (entryId: string | null) => unknown;
  onFocusPreview?: (preview: AiAgentSessionPreview) => unknown;
};

export function AiEditPreviewCards({
  entries,
  expandedEntryId = null,
  showUserPrompt = false,
  translate,
  onExpandedEntryIdChange,
  onFocusPreview
}: AiEditPreviewCardsProps) {
  if (entries.length === 0) return null;

  return (
    <div className="grid gap-2">
      {entries.map((entry, index) => (
        <AiEditPreviewCard
          entry={entry}
          expanded={expandedEntryId === entry.id}
          index={index + 1}
          key={entry.id}
          showUserPrompt={showUserPrompt}
          translate={translate}
          onExpandedChange={(expanded) => onExpandedEntryIdChange?.(expanded ? entry.id : null)}
          onFocusPreview={onFocusPreview}
        />
      ))}
    </div>
  );
}

type AiEditPreviewCardProps = {
  entry: AiEditHistoryEntry;
  expanded: boolean;
  index: number;
  showUserPrompt?: boolean;
  translate: (key: I18nKey) => string;
  onExpandedChange: (expanded: boolean) => unknown;
  onFocusPreview?: (preview: AiAgentSessionPreview) => unknown;
};

function AiEditPreviewCard({
  entry,
  expanded,
  index,
  showUserPrompt = false,
  translate,
  onExpandedChange,
  onFocusPreview
}: AiEditPreviewCardProps) {
  const { preview } = entry;
  const diffLines = compressDiff(lineDiff(preview.original, preview.replacement), 2);
  const { added, removed } = summarizeDiffLines(lineDiff(preview.original, preview.replacement));
  const summary = previewSummarySnippet(preview);
  const targetLabel = previewTargetLabel(preview);

  return (
    <article className="overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-primary)">
      <button
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-2 border-0 bg-transparent px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:bg-(--bg-hover) focus-visible:outline-none"
        type="button"
        onClick={() => onExpandedChange(!expanded)}
      >
        <FileDiff aria-hidden="true" className="mt-0.5 shrink-0 text-(--accent)" size={14} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[12px] leading-4 font-[620] text-(--text-heading)">
              {translate("app.aiEditChangeCardTitle")} {index}
            </span>
            <span className="text-[10px] leading-4 font-[540] text-(--text-tertiary)">{targetLabel}</span>
            {added > 0 || removed > 0 ? (
              <span className="text-[10px] leading-4 font-[560] text-(--text-secondary)">
                <span className="text-(--success)">+{added}</span>
                {removed > 0 ? (
                  <>
                    {" "}
                    <span className="text-(--danger)">-{removed}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
          {summary ? (
            <span className="mt-1 block truncate text-[11px] leading-4 font-[520] text-(--text-secondary)">{summary}</span>
          ) : null}
          {showUserPrompt && entry.userPrompt ? (
            <span className="mt-1 block truncate text-[10px] leading-4 text-(--text-tertiary)">{entry.userPrompt}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`mt-0.5 shrink-0 text-(--text-tertiary) transition-transform duration-150 ease-out ${
            expanded ? "rotate-180" : ""
          }`}
          size={14}
        />
      </button>
      {expanded ? (
        <div className="border-t border-(--border-default) px-3 py-2">
          <AiEditDiffView lines={diffLines} />
          {onFocusPreview ? (
            <div className="mt-2 flex justify-end">
              <button
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-(--border-default) bg-(--bg-secondary) px-2.5 text-[11px] leading-4 font-[560] text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none"
                type="button"
                onClick={() => onFocusPreview(preview)}
              >
                <LocateFixed aria-hidden="true" size={12} />
                {translate("app.aiEditChangeFocusEditor")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AiEditDiffView({ lines }: { lines: CompressedDiffLine[] }) {
  return (
    <pre className="m-0 max-h-48 overflow-auto rounded-md bg-(--bg-secondary) p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words">
      {lines.map((line, index) => (
        <div
          className={
            line.type === "added"
              ? "text-(--success)"
              : line.type === "removed"
                ? "text-(--danger)"
                : line.type === "ellipsis"
                  ? "text-(--text-tertiary)"
                  : "text-(--text-secondary)"
          }
          key={`${line.type}:${index}`}
        >
          <span className="mr-1.5 inline-block w-3 select-none opacity-70">
            {line.type === "added" ? "+" : line.type === "removed" ? "-" : line.type === "ellipsis" ? "·" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}
