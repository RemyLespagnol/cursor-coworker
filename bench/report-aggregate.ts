import type { BenchmarkComparison, BlindScore, LoadedBenchmarkRun, ObservedUsage, ProviderSummary, RunKey } from "./report-types.js";

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function sumObserved(runs: LoadedBenchmarkRun[], field: keyof ObservedUsage): number | undefined {
  const values = runs
    .map(run => run.usage[field])
    .filter((value): value is number => typeof value === "number");
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0);
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function isObserved(usage: ObservedUsage): boolean {
  return usage.state === "observed" || usage.state === "observed-incomplete";
}

function summarize(provider: string, runs: LoadedBenchmarkRun[], scores: Map<RunKey, BlindScore>): ProviderSummary {
  const scored = runs.map(run => scores.get(run.key)).filter((score): score is BlindScore => score !== undefined);
  const latencies = runs.map(run => run.latencyMs);
  const overall = scored.length === 0 ? undefined : mean(scored.map(s => (s.factualScore + s.evidenceScore) / 2));

  const summary: ProviderSummary = {
    provider,
    runs: runs.length,
    technicalSuccesses: runs.filter(run => run.status === "completed").length,
    taskSuccesses: runs.filter(run => run.taskStatus === "completed").length,
    scoredRuns: scored.length,
    scoreCoverage: ratio(scored.length, runs.length),
    usableRuns: scored.filter(s => s.usable).length,
    criticalErrors: scored.filter(s => s.criticalError).length,
    medianLatencyMs: median(latencies),
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    usageObservedRuns: runs.filter(run => isObserved(run.usage)).length,
    usageCoverage: ratio(runs.filter(run => isObserved(run.usage)).length, runs.length)
  };
  if (overall !== undefined) {
    summary.overallScore = overall;
    summary.factualScore = mean(scored.map(s => s.factualScore));
    summary.evidenceScore = mean(scored.map(s => s.evidenceScore));
    summary.usableRate = ratio(summary.usableRuns, scored.length);
  }
  const inputTokens = sumObserved(runs, "inputTokens");
  const outputTokens = sumObserved(runs, "outputTokens");
  const totalTokens = sumObserved(runs, "totalTokens");
  const estimatedUsageValueUsd = sumObserved(runs, "estimatedUsageValueUsd");
  const additionalBilledCostUsd = sumObserved(runs, "additionalBilledCostUsd");
  if (inputTokens !== undefined) summary.inputTokens = inputTokens;
  if (outputTokens !== undefined) summary.outputTokens = outputTokens;
  if (totalTokens !== undefined) summary.totalTokens = totalTokens;
  if (estimatedUsageValueUsd !== undefined) summary.estimatedUsageValueUsd = estimatedUsageValueUsd;
  if (additionalBilledCostUsd !== undefined) summary.additionalBilledCostUsd = additionalBilledCostUsd;
  return summary;
}

export function aggregateBenchmark(
  runs: LoadedBenchmarkRun[],
  scores: Map<RunKey, BlindScore>,
  now: () => Date = () => new Date()
): BenchmarkComparison {
  const byProvider = new Map<string, LoadedBenchmarkRun[]>();
  for (const run of runs) {
    const group = byProvider.get(run.provider) ?? [];
    group.push(run);
    byProvider.set(run.provider, group);
  }

  const providers = [...byProvider.entries()]
    .map(([provider, group]) => summarize(provider, group, scores))
    .sort((a, b) => (b.overallScore ?? -Infinity) - (a.overallScore ?? -Infinity) || a.provider.localeCompare(b.provider));

  const limitations = [
    ...(scores.size < runs.length ? ["Blind scores are missing for one or more runs."] : []),
    ...(runs.some(run => run.usage.state === "unknown") ? ["Usage is unknown for one or more runs."] : []),
    ...(runs.some(run => run.usage.state === "observed-incomplete") ? ["Subagent token usage is incomplete for one or more runs."] : []),
    "Estimated usage value is not necessarily an additional billed charge."
  ];

  return { schemaVersion: 1, generatedAt: now().toISOString(), providers, limitations };
}
