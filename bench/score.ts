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
  if (typeof value !== "object" || value === null) throw new Error("record must be an object");
  if (typeof value.caseId !== "string" || !value.caseId) throw new Error("caseId is required");
  if (!["primary", "native-subagent", "cursor-auto", "cursor-composer"].includes(value.path)) throw new Error("path is invalid");
  if (!["observed", "dashboard-delta", "unknown"].includes(value.cursorUsageState)) throw new Error("cursorUsageState is invalid");
  if (!Number.isInteger(value.repetition) || value.repetition < 1) throw new Error("repetition must be a positive integer");
  nonNegative(value.primaryInputTokens, "primaryInputTokens");
  nonNegative(value.latencyMs, "latencyMs");
  if (value.cursorInputTokens !== undefined) nonNegative(value.cursorInputTokens, "cursorInputTokens");
  if (value.cursorOutputTokens !== undefined) nonNegative(value.cursorOutputTokens, "cursorOutputTokens");
  if (typeof value.reopenedSources !== "boolean") throw new Error("reopenedSources must be a boolean");
  if (typeof value.criticalError !== "boolean") throw new Error("criticalError must be a boolean");
  for (const field of ["factualScore", "evidenceScore"] as const) {
    const score = value[field];
    if (!Number.isInteger(score) || score < 0 || score > 5) throw new Error(`${field} must be between 0 and 5`);
  }
  return value;
}

export function validateBenchmarkRecords(value: unknown): BenchmarkRecord[] {
  if (!Array.isArray(value)) throw new Error("benchmark input must be an array");
  return value.map(item => validateBenchmarkRecord(item as BenchmarkRecord));
}

if (process.argv[1]?.endsWith("score.js")) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const valid = validateBenchmarkRecords(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write(`${JSON.stringify({ records: valid.length, valid: true })}\n`);
}
