import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runKey } from "../bench/report-types.js";
import { loadBenchmarkRuns, loadBlindScores, attachScores } from "../bench/report-load.js";

const fixtures = resolve(__dirname, "fixtures/benchmark-report");
const cursorDir = join(fixtures, "cursor");
const claudeDir = join(fixtures, "claude");

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "report-load-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("runKey", () => {
  it("builds a canonical run key", () => {
    expect(runKey({ provider: "cursor-auto", caseId: "architecture", repetition: 1 }))
      .toBe("cursor-auto/architecture/1");
  });
});

describe("loadBenchmarkRuns", () => {
  it("loads runs from multiple directories with usage extracted from raw output", () => {
    const runs = loadBenchmarkRuns([cursorDir, claudeDir]);
    expect(runs).toHaveLength(2);
    const byKey = new Map(runs.map(run => [run.key, run]));

    const cursor = byKey.get("cursor-auto/architecture/1")!;
    expect(cursor.latencyMs).toBe(1000);
    expect(cursor.sessionId).toBe("fixture-cursor-session");
    expect(cursor.usage).toEqual({ state: "unknown" });

    const claude = byKey.get("claude-sonnet/architecture/1")!;
    expect(claude.usage).toMatchObject({
      state: "observed",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      estimatedUsageValueUsd: 0.25,
      billingState: "unknown",
      source: "claude-result"
    });
  });

  it("rejects a report whose raw output file is missing", () => {
    mkdirSync(join(tmp, "bad"));
    writeFileSync(join(tmp, "bad", "report.json"), JSON.stringify({
      schemaVersion: 1,
      runs: [{
        caseId: "architecture", category: "analysis", provider: "cursor-auto", model: "auto",
        repetition: 1, status: "completed", taskStatus: "completed", latencyMs: 1, evidenceCount: 0,
        usageState: "unknown", output: "missing.json"
      }]
    }));
    expect(() => loadBenchmarkRuns([join(tmp, "bad")])).toThrow(/missing\.json/);
  });

  it("rejects duplicate run keys across directories", () => {
    expect(() => loadBenchmarkRuns([cursorDir, cursorDir])).toThrow(/duplicate/i);
  });

  it("rejects an unsupported schema version", () => {
    mkdirSync(join(tmp, "v2"));
    writeFileSync(join(tmp, "v2", "report.json"), JSON.stringify({ schemaVersion: 2, runs: [] }));
    expect(() => loadBenchmarkRuns([join(tmp, "v2")])).toThrow(/schemaVersion/);
  });
});

describe("loadBlindScores", () => {
  const write = (doc: unknown): string => {
    const path = join(tmp, "scores.json");
    writeFileSync(path, JSON.stringify(doc));
    return path;
  };
  const base = {
    provider: "cursor-auto", caseId: "architecture", repetition: 1,
    factualScore: 5, evidenceScore: 4, usable: true, criticalError: false
  };

  it("loads valid scores keyed by run key", () => {
    const scores = loadBlindScores(join(fixtures, "scores.json"));
    expect(scores.get("cursor-auto/architecture/1")).toMatchObject({ factualScore: 5, evidenceScore: 4 });
    expect(scores.get("claude-sonnet/architecture/1")).toMatchObject({ factualScore: 4, evidenceScore: 3 });
  });

  it("rejects a factualScore outside 0..5", () => {
    expect(() => loadBlindScores(write({ schemaVersion: 1, scores: [{ ...base, factualScore: 6 }] })))
      .toThrow(/factualScore/);
  });

  it("rejects a non-integer evidenceScore", () => {
    expect(() => loadBlindScores(write({ schemaVersion: 1, scores: [{ ...base, evidenceScore: 2.5 }] })))
      .toThrow(/evidenceScore/);
  });

  it("rejects a non-boolean usable", () => {
    expect(() => loadBlindScores(write({ schemaVersion: 1, scores: [{ ...base, usable: "yes" }] })))
      .toThrow(/usable/);
  });

  it("rejects duplicate scores", () => {
    expect(() => loadBlindScores(write({ schemaVersion: 1, scores: [base, base] })))
      .toThrow(/duplicate/i);
  });
});

describe("attachScores", () => {
  it("rejects a score that references no loaded run", () => {
    const runs = loadBenchmarkRuns([cursorDir]);
    const scores = loadBlindScores(join(fixtures, "scores.json"));
    expect(() => attachScores(runs, scores)).toThrow(/claude-sonnet\/architecture\/1/);
  });

  it("allows runs without scores", () => {
    const runs = loadBenchmarkRuns([cursorDir, claudeDir]);
    const scores = loadBlindScores(join(fixtures, "scores.json"));
    scores.delete("claude-sonnet/architecture/1");
    expect(() => attachScores(runs, scores)).not.toThrow();
  });
});
