import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderMarkdown } from "../bench/report-render.js";
import type { BenchmarkComparison } from "../bench/report-types.js";

const root = resolve(__dirname, "..");
const cli = join(root, "dist/bench/report.js");
const fixtures = resolve(__dirname, "fixtures/benchmark-report");
const cursorDir = join(fixtures, "cursor");
const claudeDir = join(fixtures, "claude");
const scores = join(fixtures, "scores.json");
const csv = join(fixtures, "cursor-usage.csv");

function runCli(args: string[]) {
  return spawnSync("node", [cli, ...args], { encoding: "utf8" });
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "report-cli-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

const comparison: BenchmarkComparison = {
  schemaVersion: 1,
  generatedAt: "2026-07-11T00:00:00.000Z",
  providers: [
    {
      provider: "claude-sonnet", runs: 2, technicalSuccesses: 2, taskSuccesses: 2, scoredRuns: 2,
      scoreCoverage: 1, overallScore: 4.25, factualScore: 4.5, evidenceScore: 4, usableRuns: 2, usableRate: 1,
      criticalErrors: 0, medianLatencyMs: 3000, minLatencyMs: 2000, maxLatencyMs: 4000, usageObservedRuns: 2,
      usageCoverage: 1, inputTokens: 500, outputTokens: 100, totalTokens: 600, estimatedUsageValueUsd: 0.55
    },
    {
      provider: "cursor-auto", runs: 2, technicalSuccesses: 2, taskSuccesses: 1, scoredRuns: 2,
      scoreCoverage: 1, overallScore: 3.75, factualScore: 4, evidenceScore: 3.5, usableRuns: 1, usableRate: 0.5,
      criticalErrors: 1, medianLatencyMs: 2000, minLatencyMs: 1000, maxLatencyMs: 3000, usageObservedRuns: 1,
      usageCoverage: 0.5, inputTokens: 100, estimatedUsageValueUsd: 0.005, additionalBilledCostUsd: 0
    }
  ],
  limitations: ["Estimated usage value is not necessarily an additional billed charge."]
};

describe("renderMarkdown", () => {
  const markdown = renderMarkdown(comparison);
  it("renders a title and generated timestamp", () => {
    expect(markdown).toContain("# Benchmark Comparison");
    expect(markdown).toContain("2026-07-11T00:00:00.000Z");
  });
  it("renders one row per provider with formatted cells", () => {
    expect(markdown).toContain("| claude-sonnet | 4.25 / 5 | 2/2 |");
    expect(markdown).toContain("| cursor-auto | 3.75 / 5 | 1/2 |");
    expect(markdown).toContain("2.0 s");
    expect(markdown).toContain("$0.55");
  });
  it("renders an em dash for a missing value", () => {
    expect(markdown).toContain("| — |");
  });
  it("renders the limitations list", () => {
    expect(markdown).toContain("## Limitations");
    expect(markdown).toContain("- Estimated usage value is not necessarily an additional billed charge.");
  });
  it("ends with exactly one newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("benchmark:report CLI", () => {
  const baseArgs = [
    "--results", cursorDir, "--results", claudeDir, "--scores", scores,
    "--cursor-csv", csv, "--cursor-start", "2026-07-10T22:00:00Z",
    "--cursor-end", "2026-07-10T23:00:00Z", "--cursor-exclude-id", "exclude-me"
  ];

  it("writes a BenchmarkComparison to stdout and nothing to stderr", () => {
    const result = runCli(baseArgs);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as BenchmarkComparison;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.providers.map(p => p.provider).sort()).toEqual(["claude-sonnet", "cursor-auto"]);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("writes only the requested output files", () => {
    const jsonPath = join(tmp, "out.json");
    const mdPath = join(tmp, "out.md");
    const result = runCli([...baseArgs, "--json", jsonPath]);
    expect(result.status).toBe(0);
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(false);

    const both = runCli([...baseArgs, "--json", join(tmp, "a.json"), "--markdown", join(tmp, "a.md")]);
    expect(both.status).toBe(0);
    expect(existsSync(join(tmp, "a.json"))).toBe(true);
    expect(existsSync(join(tmp, "a.md"))).toBe(true);
  });

  it("never leaks CSV rows, user names, or session ids into output", () => {
    const jsonPath = join(tmp, "out.json");
    const mdPath = join(tmp, "out.md");
    const result = runCli([...baseArgs, "--json", jsonPath, "--markdown", mdPath]);
    const blob = result.stdout + readFileSync(jsonPath, "utf8") + readFileSync(mdPath, "utf8");
    for (const secret of ["Doe", "Roe", "Smith", "cursor-auto-event", "fixture-cursor-session", "fixture-claude-session"]) {
      expect(blob).not.toContain(secret);
    }
  });

  it("exits non-zero and writes no report files when the CSV is ambiguous", () => {
    const jsonPath = join(tmp, "out.json");
    const result = runCli([
      "--results", cursorDir, "--results", claudeDir, "--scores", scores,
      "--cursor-csv", csv, "--cursor-start", "2026-07-10T22:00:00Z",
      "--cursor-end", "2026-07-10T23:00:00Z", "--json", jsonPath
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/count|match/i);
    expect(result.stdout).toBe("");
    expect(existsSync(jsonPath)).toBe(false);
  });

  it("does not write into the input result directories", () => {
    const before = { cursor: readdirSync(cursorDir).sort(), claude: readdirSync(claudeDir).sort() };
    runCli(baseArgs);
    expect(readdirSync(cursorDir).sort()).toEqual(before.cursor);
    expect(readdirSync(claudeDir).sort()).toEqual(before.claude);
  });

  it("requires --results and --scores", () => {
    expect(runCli(["--scores", scores]).status).not.toBe(0);
    expect(runCli(["--results", cursorDir]).status).not.toBe(0);
  });

  it("rejects cursor time options without a cursor CSV", () => {
    const result = runCli(["--results", cursorDir, "--scores", scores, "--cursor-start", "2026-07-10T22:00:00Z"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/cursor-csv/i);
  });
});
