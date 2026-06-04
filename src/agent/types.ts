import type { EditChange } from "../composables/useAI";

export type WorkspaceNote = {
  path: string;
  name: string;
  isCurrent: boolean;
};

export type AgentActivity = {
  id: string;
  tool: string;
  status: "running" | "done" | "error";
  summary?: string;
  detail?: string;
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

export type AgentRunInput = {
  prompt: string;
  history?: AgentHistoryMessage[];
  doc: string;
  documentPath: string | null;
  workspacePaths: string[];
  readWorkspaceFile: (path: string) => Promise<string>;
  settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
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
  getDoc: () => string;
  documentPath: string | null;
  workspaceNotes: WorkspaceNote[];
  readWorkspaceFile: (path: string) => Promise<string>;
  pendingChanges: EditChange[] | null;
  webSearch: AgentWebSearchSettings;
  onActivity: (activity: AgentActivity) => void;
};
