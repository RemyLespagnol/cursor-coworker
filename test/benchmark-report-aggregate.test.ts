import { describe, expect, it } from "vitest";
import type { BlindScore, LoadedBenchmarkRun, ObservedUsage, RunKey } from "../bench/report-types.js";
import { aggregateBenchmark } from "../bench/report-aggregate.js";

const clock = () => new Date("2026-07-11T00:00:00.000Z");

function run(
  provider: string, repetition: number, taskStatus: string, latencyMs: number, usage: ObservedUsage
): LoadedBenchmarkRun {
  return {
    provider, caseId: "architecture", repetition, key: `${provider}/architecture/${repetition}` as RunKey,
    category: "analysis", model: provider.replace("cursor-", "").replace("claude-", ""),
    status: "completed", taskStatus, latencyMs, evidenceCount: 1,
    resultDir: "/x", output: "o.json", usage
  };
}
function score(provider: string, repetition: number, f: number, e: number, usable: boolean, crit: boolean): [RunKey, BlindScore] {
  return [`${provider}/architecture/${repetition}` as RunKey, { provider, caseId: "architecture", repetition, factualScore: f, evidenceScore: e, usable, criticalError: crit }];
}

const runs: LoadedBenchmarkRun[] = [
  run("cursor-auto", 1, "completed", 1000, { state: "observed", inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedUsageValueUsd: 0.005, additionalBilledCostUsd: 0, source: "cursor-csv" }),
  run("cursor-auto", 2, "failed", 3000, { state: "unknown" }),
  run("claude-sonnet", 1, "completed", 2000, { state: "observed", inputTokens: 200, outputTokens: 40, totalTokens: 240, estimatedUsageValueUsd: 0.25, source: "claude-result" }),
  run("claude-sonnet", 2, "completed", 4000, { state: "observed-incomplete", inputTokens: 300, outputTokens: 60, totalTokens: 360, estimatedUsageValueUsd: 0.30, source: "claude-result" })
];
const scores = new Map<RunKey, BlindScore>([
  score("cursor-auto", 1, 5, 4, true, false),
  score("cursor-auto", 2, 3, 3, false, true),
  score("claude-sonnet", 1, 4, 3, true, false),
  score("claude-sonnet", 2, 5, 5, true, false)
]);

describe("aggregateBenchmark", () => {
  const comparison = aggregateBenchmark(runs, scores, clock);

  it("stamps the injected clock", () => {
    expect(comparison.generatedAt).toBe("2026-07-11T00:00:00.000Z");
    expect(comparison.schemaVersion).toBe(1);
  });

  it("sorts providers by descending overall quality then name", () => {
    expect(comparison.providers.map(p => p.provider)).toEqual(["claude-sonnet", "cursor-auto"]);
  });

  it("computes quality as the mean of per-run factual/evidence means", () => {
    const claude = comparison.providers[0];
    expect(claude.overallScore).toBeCloseTo(4.25);
    expect(claude.factualScore).toBeCloseTo(4.5);
    expect(claude.evidenceScore).toBeCloseTo(4);
    const cursor = comparison.providers[1];
    expect(cursor.overallScore).toBeCloseTo(3.75);
  });

  it("computes usable and critical over scored runs", () => {
    const cursor = comparison.providers.find(p => p.provider === "cursor-auto")!;
    expect(cursor.usableRuns).toBe(1);
    expect(cursor.usableRate).toBeCloseTo(0.5);
    expect(cursor.criticalErrors).toBe(1);
  });

  it("counts technical and task success over all runs", () => {
    const cursor = comparison.providers.find(p => p.provider === "cursor-auto")!;
    expect(cursor.runs).toBe(2);
    expect(cursor.technicalSuccesses).toBe(2);
    expect(cursor.taskSuccesses).toBe(1);
  });

  it("reports latency statistics", () => {
    const cursor = comparison.providers.find(p => p.provider === "cursor-auto")!;
    expect(cursor.medianLatencyMs).toBe(2000);
    expect(cursor.minLatencyMs).toBe(1000);
    expect(cursor.maxLatencyMs).toBe(3000);
  });

  it("reports median latency of an even run count as the mean of the middle two", () => {
    const single = aggregateBenchmark(
      [run("cursor-auto", 1, "completed", 1000, { state: "unknown" }), run("cursor-auto", 2, "completed", 2000, { state: "unknown" }), run("cursor-auto", 3, "completed", 6000, { state: "unknown" }), run("cursor-auto", 4, "completed", 10000, { state: "unknown" })],
      new Map(), clock
    );
    expect(single.providers[0].medianLatencyMs).toBe(4000);
  });

  it("sums observed tokens and separates usage value from billed cost", () => {
    const claude = comparison.providers.find(p => p.provider === "claude-sonnet")!;
    expect(claude.inputTokens).toBe(500);
    expect(claude.estimatedUsageValueUsd).toBeCloseTo(0.55);
    expect(claude.additionalBilledCostUsd).toBeUndefined();
    const cursor = comparison.providers.find(p => p.provider === "cursor-auto")!;
    expect(cursor.inputTokens).toBe(100);
    expect(cursor.additionalBilledCostUsd).toBeCloseTo(0);
  });

  it("reports usage and score coverage", () => {
    const cursor = comparison.providers.find(p => p.provider === "cursor-auto")!;
    expect(cursor.usageObservedRuns).toBe(1);
    expect(cursor.usageCoverage).toBeCloseTo(0.5);
    expect(cursor.scoreCoverage).toBeCloseTo(1);
    const claude = comparison.providers.find(p => p.provider === "claude-sonnet")!;
    expect(claude.usageCoverage).toBeCloseTo(1);
  });

  it("lists applicable limitations", () => {
    expect(comparison.limitations).toContain("Usage is unknown for one or more runs.");
    expect(comparison.limitations).toContain("Subagent token usage is incomplete for one or more runs.");
    expect(comparison.limitations).toContain("Estimated usage value is not necessarily an additional billed charge.");
    expect(comparison.limitations).not.toContain("Blind scores are missing for one or more runs.");
  });

  it("does not divide by zero for an empty score set", () => {
    const empty = aggregateBenchmark(
      [run("cursor-auto", 1, "completed", 1000, { state: "unknown" })], new Map(), clock
    );
    const provider = empty.providers[0];
    expect(provider.overallScore).toBeUndefined();
    expect(provider.usableRate).toBeUndefined();
    expect(provider.scoreCoverage).toBe(0);
    expect(empty.limitations).toContain("Blind scores are missing for one or more runs.");
  });
});
