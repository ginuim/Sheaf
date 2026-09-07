import type { EditChange } from "../composables/useAI";
import type { AiProviderSettings, ResolvedImageModel } from "../ai-providers/types";

export type WorkspaceNote = {
  path: string;
  name: string;
  isCurrent: boolean;
};

export type AgentActivity = {
  id: string;
  kind?: "tool" | "thinking";
  tool: string;
  status: "running" | "done" | "error";
  summary?: string;
  detail?: string;
  /** 活动首次出现时，助手正文已经输出的字符数。 */
  contentOffset?: number;
  /** 同一正文偏移下的稳定事件顺序。 */
  timelineSeq?: number;
};

export type AgentRunCallbacks = {
  onTextDelta?: (text: string) => void;
  onActivity?: (activity: AgentActivity) => void;
};

export type AgentWebSearchSettings = {
  enabled: boolean;
  maxResults: number;
};

export type AgentHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AgentContextSnippet = {
  text: string;
  from: number;
  to: number;
  documentPath: string | null;
};

export type AgentRunInput = {
  prompt: string;
  history?: AgentHistoryMessage[];
  contexts?: AgentContextSnippet[];
  doc: string;
  documentPath: string | null;
  workspacePaths: string[];
  readWorkspaceFile: (path: string) => Promise<string>;
  providerSettings: AiProviderSettings;
  webSearch?: AgentWebSearchSettings;
  maxSteps?: number;
  signal: AbortSignal;
} & AgentRunCallbacks;

export type AgentRunResult = {
  assistantText: string;
  changes: EditChange[];
  activities: AgentActivity[];
  finishReason?: string;
};

export type AgentToolRuntime = {
  originalDoc: string;
  getDoc: () => string;
  setDoc: (doc: string) => void;
  documentPath: string | null;
  workspaceNotes: WorkspaceNote[];
  readWorkspaceFile: (path: string) => Promise<string>;
  pendingChanges: EditChange[] | null;
  webSearch: AgentWebSearchSettings;
  imageModel: ResolvedImageModel | null;
  onActivity: (activity: AgentActivity) => void;
};
