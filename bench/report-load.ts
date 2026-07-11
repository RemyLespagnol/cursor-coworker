import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { BlindScore, LoadedBenchmarkRun, ObservedUsage, RunKey } from "./report-types.js";
import { runKey } from "./report-types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${context} requires string ${field}`);
  return value;
}

function requireNumber(record: Record<string, unknown>, field: string, context: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${context} requires number ${field}`);
  return value;
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return value;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function normalizeUsage(provider: string, usageState: string, raw: Record<string, unknown>): ObservedUsage {
  if (!provider.startsWith("claude-")) return { state: usageState as ObservedUsage["state"] };
  const usage = asRecord(raw.usage, "claude usage");
  return omitUndefined({
    state: usageState as ObservedUsage["state"],
    inputTokens: optionalNonNegative(usage.inputTokens, "inputTokens"),
    outputTokens: optionalNonNegative(usage.outputTokens, "outputTokens"),
    cacheReadTokens: optionalNonNegative(usage.cacheReadTokens, "cacheReadTokens"),
    cacheWriteTokens: optionalNonNegative(usage.cacheWriteTokens, "cacheWriteTokens"),
    totalTokens: optionalNonNegative(usage.totalTokens, "totalTokens"),
    estimatedUsageValueUsd: optionalNonNegative(usage.costUsd, "costUsd"),
    billingState: "unknown" as const,
    source: "claude-result" as const
  }) as ObservedUsage;
}

function extractSessionId(provider: string, raw: Record<string, unknown>): string | undefined {
  if (provider.startsWith("claude-")) {
    return typeof raw.sessionId === "string" ? raw.sessionId : undefined;
  }
  const execution = raw.execution;
  if (typeof execution === "object" && execution !== null) {
    const sessionId = (execution as Record<string, unknown>).sessionId;
    if (typeof sessionId === "string") return sessionId;
  }
  return undefined;
}

export function loadBenchmarkRuns(resultDirs: string[]): LoadedBenchmarkRun[] {
  const runs: LoadedBenchmarkRun[] = [];
  const seen = new Set<RunKey>();
  for (const dir of resultDirs) {
    const resultDir = resolve(dir);
    const report = asRecord(readJson(join(resultDir, "report.json")), `${dir}/report.json`);
    if (report.schemaVersion !== 1) throw new Error(`${dir}/report.json requires schemaVersion 1`);
    if (!Array.isArray(report.runs)) throw new Error(`${dir}/report.json requires a runs array`);
    for (const entry of report.runs) {
      const run = asRecord(entry, `${dir} run`);
      const provider = requireString(run, "provider", `${dir} run`);
      const caseId = requireString(run, "caseId", `${dir} run`);
      const repetition = requireNumber(run, "repetition", `${dir} run`);
      const output = requireString(run, "output", `${dir} run`);
      const key = runKey({ provider, caseId, repetition });
      if (seen.has(key)) throw new Error(`duplicate run key ${key}`);
      seen.add(key);
      const rawPath = join(resultDir, output);
      let raw: Record<string, unknown>;
      try {
        raw = asRecord(readJson(rawPath), `${output}`);
      } catch (error) {
        throw new Error(`missing or invalid raw output ${output}: ${error instanceof Error ? error.message : String(error)}`);
      }
      const usageState = requireString(run, "usageState", `${dir} run`);
      runs.push(omitUndefined({
        provider, caseId, repetition, key,
        category: requireString(run, "category", `${dir} run`),
        model: requireString(run, "model", `${dir} run`),
        status: requireString(run, "status", `${dir} run`),
        taskStatus: requireString(run, "taskStatus", `${dir} run`),
        latencyMs: requireNumber(run, "latencyMs", `${dir} run`),
        evidenceCount: requireNumber(run, "evidenceCount", `${dir} run`),
        resultDir,
        output,
        sessionId: extractSessionId(provider, raw),
        usage: normalizeUsage(provider, usageState, raw)
      }) as LoadedBenchmarkRun);
    }
  }
  return runs;
}

function validateScore(entry: unknown, index: number): BlindScore {
  const record = asRecord(entry, `score ${index + 1}`);
  const bounded = (field: string): number => {
    const value = record[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) {
      throw new Error(`score ${index + 1} ${field} must be an integer from 0 through 5`);
    }
    return value;
  };
  const bool = (field: string): boolean => {
    const value = record[field];
    if (typeof value !== "boolean") throw new Error(`score ${index + 1} ${field} must be a boolean`);
    return value;
  };
  return {
    provider: requireString(record, "provider", `score ${index + 1}`),
    caseId: requireString(record, "caseId", `score ${index + 1}`),
    repetition: requireNumber(record, "repetition", `score ${index + 1}`),
    factualScore: bounded("factualScore"),
    evidenceScore: bounded("evidenceScore"),
    usable: bool("usable"),
    criticalError: bool("criticalError")
  };
}

export function loadBlindScores(path: string): Map<RunKey, BlindScore> {
  const document = asRecord(readJson(path), "scores document");
  if (document.schemaVersion !== 1) throw new Error("scores document requires schemaVersion 1");
  if (!Array.isArray(document.scores)) throw new Error("scores document requires a scores array");
  const scores = new Map<RunKey, BlindScore>();
  document.scores.forEach((entry, index) => {
    const score = validateScore(entry, index);
    const key = runKey(score);
    if (scores.has(key)) throw new Error(`duplicate score for ${key}`);
    scores.set(key, score);
  });
  return scores;
}

export function attachScores(runs: LoadedBenchmarkRun[], scores: Map<RunKey, BlindScore>): void {
  const keys = new Set(runs.map(run => run.key));
  for (const key of scores.keys()) {
    if (!keys.has(key)) throw new Error(`score references unknown run ${key}`);
  }
}
