import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { runClaudeInvocation } from "../bench/claude.js";

function repository(): { path: string; commit: string } {
  const path = mkdtempSync(join(tmpdir(), "claude-bench-repo-"));
  execFileSync("git", ["init", "-q", path]);
  execFileSync("git", ["-C", path, "config", "user.email", "bench@example.test"]);
  execFileSync("git", ["-C", path, "config", "user.name", "Benchmark"]);
  writeFileSync(join(path, "README.md"), "fixture\n");
  execFileSync("git", ["-C", path, "add", "README.md"]);
  execFileSync("git", ["-C", path, "commit", "-qm", "fixture"]);
  return { path, commit: execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
}

function fakeClaude(log: string, exitCode = 0): string {
  const path = join(mkdtempSync(join(tmpdir(), "fake-claude-")), "claude");
  writeFileSync(path, `#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
let origin;
try { origin = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim(); } catch {}
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), origin }));
fs.writeFileSync("generated.txt", "disposable");
process.stdout.write(JSON.stringify({
  result: "Mapped the fixture",
  structured_output: { summary: "Mapped the fixture", evidence: [{ kind: "file", value: "README.md" }] },
  session_id: "session-1",
  duration_ms: 123,
  total_cost_usd: 0.25,
  usage: { input_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 30, output_tokens: 40 }
}));
process.exitCode = ${exitCode};
`);
  chmodSync(path, 0o755);
  return path;
}

describe("Claude benchmark invocation", () => {
  test("runs Sonnet read-only in a disposable clone and records observed usage", async () => {
    const repo = repository();
    const log = join(mkdtempSync(join(tmpdir(), "claude-bench-log-")), "call.json");

    const result = await runClaudeInvocation({
      repo: repo.path,
      commit: repo.commit,
      provider: "claude-sonnet",
      task: "Map modules",
      claudeExecutable: fakeClaude(log)
    });

    const call = JSON.parse(readFileSync(log, "utf8")) as { args: string[]; cwd: string; origin?: string };
    expect(call.cwd).not.toBe(repo.path);
    expect(call.origin).toBeUndefined();
    expect(existsSync(call.cwd)).toBe(false);
    expect(call.args).toContain("sonnet");
    expect(call.args).not.toContain("--dangerously-skip-permissions");
    expect(call.args).toContain("--safe-mode");
    expect(call.args).toContain("dontAsk");
    expect(call.args).toContain("Read,Glob,Grep");
    expect(call.args).not.toContain("--setting-sources");
    expect(result.usage).toEqual({
      state: "observed",
      inputTokens: 330,
      outputTokens: 40,
      cacheReadTokens: 200,
      cacheWriteTokens: 30,
      totalTokens: 370,
      costUsd: 0.25,
      coverage: "complete"
    });
    expect(result.workspaceChanged).toBe(true);
    expect(result.taskStatus).toBe("completed");
    expect(result.evidence).toEqual([{ kind: "file", value: "README.md" }]);
    expect(call.args).toContain("--json-schema");
    expect(existsSync(join(repo.path, "generated.txt"))).toBe(false);
  });

  test("enables the Agent tool for the subagent variant", async () => {
    const repo = repository();
    const log = join(mkdtempSync(join(tmpdir(), "claude-bench-log-")), "call.json");

    await runClaudeInvocation({
      repo: repo.path,
      commit: repo.commit,
      provider: "claude-sonnet-subagents",
      task: "Map modules",
      claudeExecutable: fakeClaude(log)
    });

    const args = (JSON.parse(readFileSync(log, "utf8")) as { args: string[] }).args;
    expect(args).toContain("Read,Glob,Grep,Agent");
    expect(args.join(" ")).toContain("Delegate repository exploration to subagents");
    expect(args.indexOf("Map modules")).toBeLessThan(args.indexOf("--append-system-prompt"));
    const result = await runClaudeInvocation({
      repo: repo.path,
      commit: repo.commit,
      provider: "claude-sonnet-subagents",
      task: "Map modules",
      claudeExecutable: fakeClaude(join(mkdtempSync(join(tmpdir(), "claude-bench-log-")), "second.json"))
    });
    expect(result.usage.coverage).toBe("parent-only");
  });

  test("captures disposable workspace changes when Claude exits unsuccessfully", async () => {
    const repo = repository();
    const result = await runClaudeInvocation({
      repo: repo.path,
      commit: repo.commit,
      provider: "claude-sonnet",
      task: "Map modules",
      claudeExecutable: fakeClaude(join(mkdtempSync(join(tmpdir(), "claude-bench-log-")), "failed.json"), 1)
    });

    expect(result.status).toBe("failed");
    expect(result.taskStatus).toBe("failed");
    expect(result.workspaceChanged).toBe(true);
  });
});
