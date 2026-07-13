import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSkill } from "../src/commands/install-skill.js";

let root: string;
let project: string;
let home: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cursor-coworker-skill-"));
  project = join(root, "project");
  home = join(root, "home");
  mkdirSync(project);
  mkdirSync(home);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("installSkill", () => {
  it.each([
    ["codex", "project", ".agents/skills/cursor-coworker/SKILL.md"],
    ["claude", "project", ".claude/skills/cursor-coworker/SKILL.md"],
    ["codex", "user", ".agents/skills/cursor-coworker/SKILL.md"],
    ["claude", "user", ".claude/skills/cursor-coworker/SKILL.md"]
  ] as const)("installs %s at %s scope", (host, scope, relative) => {
    const result = installSkill(
      { host, scope, cwd: project },
      { processCwd: project, userHome: home }
    );
    const expected = resolve(scope === "project" ? project : home, relative);
    expect(result).toEqual({ schemaVersion: 1, status: "installed", host, scope, path: expected });
    expect(readFileSync(expected, "utf8")).toBe(readFileSync("skills/cursor-coworker/SKILL.md", "utf8"));
  });

  it("uses the process working directory when project cwd is omitted", () => {
    const result = installSkill(
      { host: "codex", scope: "project" },
      { processCwd: project, userHome: home }
    );
    expect(result.path).toBe(resolve(project, ".agents/skills/cursor-coworker/SKILL.md"));
  });

  it("refuses to overwrite an existing skill and preserves its contents", () => {
    const destination = join(project, ".agents/skills/cursor-coworker/SKILL.md");
    mkdirSync(join(project, ".agents/skills/cursor-coworker"), { recursive: true });
    writeFileSync(destination, "owned by user\n");
    expect(() => installSkill(
      { host: "codex", scope: "project", cwd: project },
      { processCwd: project, userHome: home }
    )).toThrow(`Skill already exists: ${destination}`);
    expect(readFileSync(destination, "utf8")).toBe("owned by user\n");
  });

  it("does not leave a partial destination when the asset cannot be read", () => {
    const destination = join(project, ".agents/skills/cursor-coworker/SKILL.md");
    expect(() => installSkill(
      { host: "codex", scope: "project", cwd: project },
      { processCwd: project, userHome: home, assetPath: join(root, "missing.md") }
    )).toThrow();
    expect(existsSync(destination)).toBe(false);
  });
});
