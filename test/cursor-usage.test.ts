import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { LoadedBenchmarkRun } from "../bench/report-types.js";
import { parseCsv, attributeCursorUsage, applyCursorUsage } from "../bench/cursor-usage.js";

const csvPath = join(resolve(__dirname, "fixtures/benchmark-report"), "cursor-usage.csv");
const csvText = readFileSync(csvPath, "utf8");
const window = { startAt: "2026-07-10T22:00:00Z", endAt: "2026-07-10T23:00:00Z", excludedAgentIds: ["exclude-me"] };

function cursorRun(model: string, repetition: number): LoadedBenchmarkRun {
  return {
    provider: `cursor-${model}`, caseId: "architecture", repetition,
    key: `cursor-${model}/architecture/${repetition}`,
    category: "analysis", model, status: "completed", taskStatus: "completed",
    latencyMs: 1000, evidenceCount: 1, resultDir: "/x", output: "o.json",
    usage: { state: "unknown" }
  };
}
function claudeRun(): LoadedBenchmarkRun {
  return {
    provider: "claude-sonnet", caseId: "architecture", repetition: 1,
    key: "claude-sonnet/architecture/1", category: "analysis", model: "sonnet",
    status: "completed", taskStatus: "completed", latencyMs: 2000, evidenceCount: 1,
    resultDir: "/y", output: "c.json",
    usage: { state: "observed", inputTokens: 100, outputTokens: 20, totalTokens: 120, source: "claude-result" }
  };
}
const runs = () => [cursorRun("auto", 1), cursorRun("composer-2.5", 1), claudeRun()];

describe("parseCsv", () => {
  it("handles quoted commas and escaped double quotes", () => {
    const rows = parseCsv(`a,"b, c","d""e"\n1,2,3\n`);
    expect(rows[0]).toEqual(["a", "b, c", `d"e`]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("accepts CRLF and LF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("rejects an unclosed quoted field", () => {
    expect(() => parseCsv(`a,"b`)).toThrow(/unclosed/i);
  });
});

describe("attributeCursorUsage", () => {
  it("rejects a file missing a required header", () => {
    const bad = csvText.replace("Cache Read,", "");
    expect(() => attributeCursorUsage(runs(), bad, window)).toThrow(/Cache Read/);
  });

  it("rejects an invalid or empty window", () => {
    expect(() => attributeCursorUsage(runs(), csvText, { ...window, endAt: window.startAt }))
      .toThrow(/end/i);
    expect(() => attributeCursorUsage(runs(), csvText, { ...window, startAt: "not-a-date" }))
      .toThrow(/start/i);
  });

  it("attributes usage to the matching Cursor run using Auto pricing", () => {
    const attribution = attributeCursorUsage(runs(), csvText, window);
    const attributed = attribution.entries.find(entry => entry.key === "cursor-auto/architecture/1")!;
    expect(attributed.usage).toMatchObject({
      inputTokens: 1000,
      cacheReadTokens: 2000,
      outputTokens: 500,
      totalTokens: 3500,
      estimatedUsageValueUsd: 0.00475,
      additionalBilledCostUsd: 0,
      billingState: "included",
      source: "cursor-csv"
    });
  });

  it("excludes auxiliary events by Cloud Agent ID", () => {
    const attribution = attributeCursorUsage(runs(), csvText, window);
    expect(attribution.entries).toHaveLength(2);
  });

  it("applies the half-open window (exclusive end)", () => {
    expect(() => attributeCursorUsage(runs(), csvText, { ...window, endAt: "2026-07-10T22:30:00Z" }))
      .toThrow(/count/i);
  });

  it("rejects when event count differs from Cursor run count", () => {
    expect(() => attributeCursorUsage([cursorRun("auto", 1), cursorRun("auto", 2)], csvText, window)).toThrow(/count/i);
  });

  it("rejects when the event model sequence differs from the run sequence", () => {
    const reordered = [cursorRun("composer-2.5", 1), cursorRun("auto", 1)];
    expect(() => attributeCursorUsage(reordered, csvText, window)).toThrow(/model/i);
  });

  it("preserves Claude usage while enriching Cursor runs", () => {
    const attribution = attributeCursorUsage(runs(), csvText, window);
    const applied = applyCursorUsage(runs(), attribution);
    const claude = applied.find(run => run.provider === "claude-sonnet")!;
    expect(claude.usage).toMatchObject({ state: "observed", inputTokens: 100, source: "claude-result" });
    const cursor = applied.find(run => run.provider === "cursor-auto")!;
    expect(cursor.usage).toMatchObject({ source: "cursor-csv", billingState: "included" });
  });

  it("marks a numeric Cost as a charged additional billed cost", () => {
    const charged = csvText.replace(/,Included\n/g, ",$1.50\n");
    const attribution = attributeCursorUsage(runs(), charged, window);
    const attributed = attribution.entries.find(entry => entry.key === "cursor-auto/architecture/1")!;
    expect(attributed.usage.billingState).toBe("charged");
    expect(attributed.usage.additionalBilledCostUsd).toBeCloseTo(1.5);
  });
});
