import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import type { SkillInstallResult } from "../src/types.js";

it("runs when the executable is reached through a symlink", () => {
  const cli = resolve("dist/src/cli.js");
  const temporary = mkdtempSync(join(tmpdir(), "cursor-coworker-symlink-"));
  try {
    const link = join(temporary, "cursor-coworker.js");
    symlinkSync(cli, link);
    const result = spawnSync(process.execPath, [link, "instructions", "claude"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("invoke /cursor-coworker exactly once");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

it("prints generated Claude instructions", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const code = await main(["instructions", "claude"], { stdout, stderr });
  expect(code).toBe(0);
  const text = stdout.mock.calls[0]?.[0] ?? "";
  expect(text).toBe(
    "## Cursor Coworker delegation\n\n" +
    "For every bounded read-only repository question that requires broad synthesis, you must invoke /cursor-coworker exactly once before using direct repository exploration tools. Treat architecture explanation, tracing behavior across two or more modules, comparing components, locating an unknown implementation, and cross-cutting risk analysis as broad synthesis, even when existing repository context provides entry-point files or symbols. Keep a known-file or known-symbol lookup, trivial search, complete narrow answer already in context, editing task, or non-repository question local. Never invoke Cursor Coworker for edits.\n\n" +
    "Consume the compact JSON result; do not request the raw Cursor transcript. The current workflow remains responsible for Git isolation, concurrency, verification, and review.\n"
  );
  expect(stderr).not.toHaveBeenCalled();
});

it("keeps generated Codex instructions on the direct CLI flow", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["instructions", "codex"], { stdout, stderr })).toBe(0);
  const text = stdout.mock.calls[0]?.[0] ?? "";
  expect(text).toContain('cursor-coworker analyze --task "<bounded question>"');
  expect(text).not.toContain("/cursor-coworker");
  expect(stderr).not.toHaveBeenCalled();
});

it("returns usage error without a task", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["analyze"], { stdout, stderr })).toBe(2);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--task is required"));
});

it("returns a usage error for unknown options without throwing", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["analyze", "--wat"], { stdout, stderr })).toBe(2);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Unknown option"));
});

it("returns a usage error for a malformed timeout", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["analyze", "--task", "read", "--timeout", "nope"], { stdout, stderr })).toBe(2);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("positive integer"));
});

it("installs a project Codex skill and prints one JSON object", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const result: SkillInstallResult = {
    schemaVersion: 1,
    status: "installed",
    host: "codex",
    scope: "project",
    path: "/repo/.agents/skills/cursor-coworker/SKILL.md"
  };
  const install = vi.fn(() => result);

  const code = await main(
    ["install-skill", "codex", "--cwd", "/repo"],
    { stdout, stderr },
    { installSkill: install }
  );

  expect(code).toBe(0);
  expect(install).toHaveBeenCalledWith({ host: "codex", scope: "project", cwd: "/repo" });
  expect(stdout).toHaveBeenCalledTimes(1);
  expect(JSON.parse(stdout.mock.calls[0]![0])).toEqual(result);
  expect(stderr).not.toHaveBeenCalled();
});

it("accepts explicit Claude user scope", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const install = vi.fn((): SkillInstallResult => ({
    schemaVersion: 1,
    status: "installed",
    host: "claude",
    scope: "user",
    path: "/home/me/.claude/skills/cursor-coworker/SKILL.md"
  }));
  expect(await main(
    ["install-skill", "claude", "--scope", "user"],
    { stdout, stderr },
    { installSkill: install }
  )).toBe(0);
  expect(install).toHaveBeenCalledWith({ host: "claude", scope: "user" });
});

it.each([
  [["install-skill"], "target must be codex or claude"],
  [["install-skill", "other"], "target must be codex or claude"],
  [["install-skill", "codex", "--scope", "team"], "--scope must be project or user"],
  [["install-skill", "codex", "--wat"], "Unknown option"]
] as const)("rejects invalid install-skill arguments", async (argv, message) => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main([...argv], { stdout, stderr }, { installSkill: vi.fn() })).toBe(2);
  expect(stdout).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining(message));
});

it("keeps stdout empty and returns one on installation failure", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const install = vi.fn(() => { throw new Error("Skill already exists: /repo/SKILL.md"); });
  expect(await main(
    ["install-skill", "codex"],
    { stdout, stderr },
    { installSkill: install }
  )).toBe(1);
  expect(stdout).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledWith("Skill already exists: /repo/SKILL.md\n");
});
