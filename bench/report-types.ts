export type RunKey = `${string}/${string}/${number}`;

export interface RunIdentity {
  provider: string;
  caseId: string;
  repetition: number;
}

export interface ObservedUsage {
  state: "observed" | "observed-incomplete" | "unknown";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  estimatedUsageValueUsd?: number;
  additionalBilledCostUsd?: number;
  billingState?: "included" | "charged" | "unknown";
  source?: "cursor-csv" | "claude-result";
}

export interface LoadedBenchmarkRun extends RunIdentity {
  key: RunKey;
  category: string;
  model: string;
  status: string;
  taskStatus: string;
  latencyMs: number;
  evidenceCount: number;
  resultDir: string;
  output: string;
  sessionId?: string;
  usage: ObservedUsage;
}

export interface BlindScore extends RunIdentity {
  factualScore: number;
  evidenceScore: number;
  usable: boolean;
  criticalError: boolean;
}

export function runKey(identity: RunIdentity): RunKey {
  return `${identity.provider}/${identity.caseId}/${identity.repetition}`;
}
