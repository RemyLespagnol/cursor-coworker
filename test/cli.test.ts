import { expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import type { SkillInstallResult } from "../src/types.js";

it("prints generated Claude instructions", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const code = await main(["instructions", "claude"], { stdout, stderr });
  expect(code).toBe(0);
  expect(stdout.mock.calls[0]?.[0]).toContain("cursor-coworker analyze");
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
