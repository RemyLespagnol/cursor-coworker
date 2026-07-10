export type BenchmarkPath = "primary" | "native-subagent" | "cursor-auto" | "cursor-composer";

export interface BenchmarkRecord {
  caseId: string;
  path: BenchmarkPath;
  repetition: number;
  primaryInputTokens: number;
  cursorUsageState: "observed" | "dashboard-delta" | "unknown";
  cursorInputTokens?: number;
  cursorOutputTokens?: number;
  latencyMs: number;
  factualScore: number;
  evidenceScore: number;
  reopenedSources: boolean;
  criticalError: boolean;
}

function nonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
}

export function validateBenchmarkRecord(value: BenchmarkRecord): BenchmarkRecord {
  if (!value.caseId) throw new Error("caseId is required");
  if (!Number.isInteger(value.repetition) || value.repetition < 1) throw new Error("repetition must be a positive integer");
  nonNegative(value.primaryInputTokens, "primaryInputTokens");
  nonNegative(value.latencyMs, "latencyMs");
  for (const field of ["factualScore", "evidenceScore"] as const) {
    const score = value[field];
    if (!Number.isInteger(score) || score < 0 || score > 5) throw new Error(`${field} must be between 0 and 5`);
  }
  return value;
}

if (process.argv[1]?.endsWith("score.js")) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const records = JSON.parse(Buffer.concat(chunks).toString("utf8")) as BenchmarkRecord[];
  const valid = records.map(validateBenchmarkRecord);
  process.stdout.write(`${JSON.stringify({ records: valid.length, valid: true })}\n`);
}
