import { useMemo, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import type { AiAgentSessionPreview } from "@markra/ai";
import type { I18nKey } from "@markra/shared";
import { collectAiEditHistory } from "../lib/ai-edit-session";
import type { AiAgentPanelMessage } from "../hooks/useAiAgentSession";
import { AiEditPreviewCards } from "./AiEditPreviewCards";

type AiEditHistorySectionProps = {
  messages: AiAgentPanelMessage[];
  translate: (key: I18nKey) => string;
  onFocusPreview?: (preview: AiAgentSessionPreview) => unknown;
};

export function AiEditHistorySection({ messages, translate, onFocusPreview }: AiEditHistorySectionProps) {
  const entries = useMemo(() => collectAiEditHistory(messages), [messages]);
  const [sectionOpen, setSectionOpen] = useState(entries.length > 0);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section className="shrink-0 border-t border-(--border-default) bg-(--bg-secondary) px-3 py-2">
      <button
        aria-expanded={sectionOpen}
        className="flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-1 text-left text-[12px] leading-4 font-[620] text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
        type="button"
        onClick={() => setSectionOpen((open) => !open)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <History aria-hidden="true" className="shrink-0 text-(--text-tertiary)" size={14} />
          <span className="truncate">{translate("app.aiEditHistory")}</span>
          <span className="shrink-0 rounded-full bg-(--bg-active) px-1.5 text-[10px] font-[560] text-(--text-tertiary)">
            {entries.length}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`shrink-0 text-(--text-tertiary) transition-transform duration-150 ease-out ${
            sectionOpen ? "rotate-180" : ""
          }`}
          size={14}
        />
      </button>
      {sectionOpen ? (
        <div className="mt-2 max-h-56 overflow-auto pb-1">
          <AiEditPreviewCards
            entries={entries}
            expandedEntryId={expandedEntryId}
            showUserPrompt
            translate={translate}
            onExpandedEntryIdChange={setExpandedEntryId}
            onFocusPreview={onFocusPreview}
          />
        </div>
      ) : null}
    </section>
  );
}
