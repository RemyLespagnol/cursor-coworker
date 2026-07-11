import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { benchmarkSucceeded, parsePositiveInteger, parseProviders, runBenchmark } from "../bench/run.js";
import type { ResultEnvelope } from "../src/types.js";

function completed(model: string, durationMs: number): ResultEnvelope {
  return {
    schemaVersion: 1,
    status: { technical: "completed", task: "completed" },
    summary: `${model} result`,
    evidence: [{ kind: "file", value: "src/index.ts" }],
    changes: { available: false },
    execution: { mode: "analyze", requestedModel: model, durationMs, exitCode: 0 },
    usage: { state: "unknown" },
    warnings: []
  };
}

describe("runBenchmark", () => {
  test("rejects empty providers and invalid numeric options", () => {
    expect(() => parseProviders(",")).toThrow("--providers must contain at least one provider");
    expect(() => parsePositiveInteger("0", "--timeout")).toThrow("--timeout must be a positive integer");
    expect(() => parsePositiveInteger("NaN", "--timeout")).toThrow("--timeout must be a positive integer");
  });

  test("requires both technical and task completion for CLI success", () => {
    expect(benchmarkSucceeded([{ status: "completed", taskStatus: "failed" }])).toBe(false);
    expect(benchmarkSucceeded([{ status: "completed", taskStatus: "completed" }])).toBe(true);
  });

  test("runs every read-only case sequentially and writes raw results plus a report", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "cursor-coworker-bench-"));
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;

    const report = await runBenchmark({
      repo: "/target/repo",
      outputDir,
      models: ["auto", "composer-2.5"],
      repetitions: 2,
      cases: [
        { id: "architecture", category: "architecture", task: "Map modules" },
        { id: "flow", category: "flow", task: "Trace a request" }
      ]
    }, {
      snapshotRepo: async () => ({ commit: "abc123", status: "" }),
      delegate: async request => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push(`${request.cli.model}:${request.task}`);
        await Promise.resolve();
        active -= 1;
        return completed(String(request.cli.model), 25);
      }
    });

    expect(calls).toHaveLength(8);
    expect(maxActive).toBe(1);
    expect(report.target).toMatchObject({ commit: "abc123", unchanged: true });
    expect(report.runs).toHaveLength(8);
    expect(report.runs.every(run => run.status === "completed")).toBe(true);
    expect(JSON.parse(readFileSync(join(outputDir, "report.json"), "utf8"))).toEqual(report);
    expect(JSON.parse(readFileSync(join(outputDir, "architecture-auto-1.json"), "utf8")).summary).toBe("auto result");
  });

  test("stops when the target repository changes", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "cursor-coworker-bench-"));
    let snapshots = 0;

    await expect(runBenchmark({
      repo: "/target/repo",
      outputDir,
      models: ["auto"],
      repetitions: 1,
      cases: [{ id: "architecture", category: "architecture", task: "Map modules" }]
    }, {
      snapshotRepo: async () => ({ commit: "abc123", status: snapshots++ === 0 ? "" : " M generated.txt" }),
      delegate: async request => completed(String(request.cli.model), 25)
    })).rejects.toThrow("Target repository changed during benchmark");
  });

  test("rejects a dirty target before making Cursor calls", async () => {
    let delegated = false;

    await expect(runBenchmark({
      repo: "/target/repo",
      outputDir: mkdtempSync(join(tmpdir(), "cursor-coworker-bench-")),
      models: ["auto"],
      repetitions: 1,
      cases: [{ id: "architecture", category: "architecture", task: "Map modules" }]
    }, {
      snapshotRepo: async () => ({ commit: "abc123", status: "?? local.txt" }),
      delegate: async request => { delegated = true; return completed(String(request.cli.model), 25); }
    })).rejects.toThrow("Target repository must be clean");

    expect(delegated).toBe(false);
  });

  test("runs selected Claude providers without making Cursor calls", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "cursor-coworker-bench-"));
    const providers: string[] = [];
    let delegated = false;

    const report = await runBenchmark({
      repo: "/target/repo",
      outputDir,
      models: ["auto", "composer-2.5"],
      providers: ["claude-sonnet", "claude-sonnet-subagents"],
      repetitions: 1,
      cases: [{ id: "architecture", category: "architecture", task: "Map modules" }]
    }, {
      snapshotRepo: async () => ({ commit: "abc123", status: "" }),
      delegate: async request => { delegated = true; return completed(String(request.cli.model), 25); },
      invokeClaude: async options => {
        providers.push(options.provider);
        return {
          provider: options.provider,
          status: "completed",
          taskStatus: "completed",
          summary: `${options.provider} result`,
          evidence: [],
          durationMs: 30,
          workspaceChanged: false,
          usage: { state: "observed", inputTokens: 10, outputTokens: 2, totalTokens: 12 },
          warnings: []
        };
      }
    });

    expect(delegated).toBe(false);
    expect(providers).toEqual(["claude-sonnet", "claude-sonnet-subagents"]);
    expect(report.configuration).toMatchObject({
      models: ["sonnet"],
      providers: ["claude-sonnet", "claude-sonnet-subagents"]
    });
    expect(report.runs.map(run => run.provider)).toEqual(providers);
    expect(report.runs.map(run => run.usageState)).toEqual(["observed", "observed-incomplete"]);
    expect(JSON.parse(readFileSync(join(outputDir, "architecture-claude-sonnet-1.json"), "utf8")).summary).toBe("claude-sonnet result");
  });

  test("records a failed Claude run and continues the matrix", async () => {
    let calls = 0;
    const report = await runBenchmark({
      repo: "/target/repo",
      outputDir: mkdtempSync(join(tmpdir(), "cursor-coworker-bench-")),
      models: [],
      providers: ["claude-sonnet"],
      repetitions: 2,
      cases: [{ id: "architecture", category: "architecture", task: "Map modules" }]
    }, {
      snapshotRepo: async () => ({ commit: "abc123", status: "" }),
      invokeClaude: async options => {
        calls += 1;
        if (calls === 1) throw new Error("Claude exited 1");
        return {
          provider: options.provider, status: "completed", taskStatus: "completed", summary: "ok", evidence: [],
          durationMs: 10, workspaceChanged: false, usage: { state: "unknown" }, warnings: []
        };
      }
    });

    expect(calls).toBe(2);
    expect(report.runs.map(run => run.status)).toEqual(["failed", "completed"]);
  });

  test("records a failed Cursor run, checks target integrity, and continues", async () => {
    let calls = 0;
    let snapshots = 0;
    const report = await runBenchmark({
      repo: "/target/repo",
      outputDir: mkdtempSync(join(tmpdir(), "cursor-coworker-bench-")),
      models: ["auto"],
      repetitions: 2,
      cases: [{ id: "architecture", category: "architecture", task: "Map modules" }]
    }, {
      snapshotRepo: async () => { snapshots += 1; return { commit: "abc123", status: "" }; },
      delegate: async request => {
        calls += 1;
        if (calls === 1) throw new Error("Cursor exited 1");
        return completed(String(request.cli.model), 25);
      }
    });

    expect(calls).toBe(2);
    expect(snapshots).toBe(3);
    expect(report.runs.map(run => run.status)).toEqual(["failed", "completed"]);
  });
});
