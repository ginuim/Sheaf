export interface ProofreadIssue {
  id: string;
  status?: "pending" | "applied" | "ignored";
  from: number;
  to: number;
  original: string;
  suggestion: string;
  reason: string;
  context?: string;
  line?: number;
}

export interface ProofreadResult {
  issues: ProofreadIssue[];
  rawResponse: string;
}
