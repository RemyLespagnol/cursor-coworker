export type ModelId = "auto" | "composer-2.5" | (string & {});
export type DelegateMode = "analyze" | "run";
export type CompletionState = "completed" | "incomplete" | "failed" | "interrupted";

export interface ResolvedConfig {
  cwd: string;
  model: ModelId;
  sandbox: boolean;
  retainTranscript: boolean;
  timeoutMs: number;
  cursorExecutable: string;
}

export interface EvidenceItem {
  kind: "file" | "symbol" | "command" | "test" | "other";
  value: string;
  detail?: string;
}

export interface ResultEnvelope {
  schemaVersion: 1;
  status: { technical: CompletionState; task: CompletionState };
  summary: string;
  evidence: EvidenceItem[];
  changes: { available: boolean; before?: string; after?: string };
  execution: {
    mode: DelegateMode;
    requestedModel: string;
    durationMs: number;
    exitCode: number | null;
    sessionId?: string;
    requestId?: string;
  };
  usage: { state: "observed" | "unknown"; inputTokens?: number; outputTokens?: number };
  warnings: string[];
}
