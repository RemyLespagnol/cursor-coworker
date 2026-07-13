import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourcePath = "skills/cursor-coworker/SKILL.md";

describe("cursor-coworker skill asset", () => {
  it("uses portable Agent Skills frontmatter and explicit activation boundaries", () => {
    const skill = readFileSync(sourcePath, "utf8");
    expect(skill).toMatch(/^---\nname: cursor-coworker\ndescription: .+\n---\n/);
    expect(skill).toContain("unfamiliar architecture");
    expect(skill).toContain("request or data flow");
    expect(skill).toContain("known file or symbol");
    expect(skill).toContain("CodeGraph");
    expect(skill).not.toMatch(/allowed-tools:|context:|agent:|disable-model-invocation:/);
  });

  it("contains the complete read-only delegation and fallback contract", () => {
    const skill = readFileSync(sourcePath, "utf8");
    expect(skill).toContain('cursor-coworker analyze --task "<bounded-question>" --cwd "<repository>"');
    expect(skill).toContain('schemaVersion');
    expect(skill).toContain('status.technical');
    expect(skill).toContain('status.task');
    expect(skill).toContain('evidence');
    expect(skill).toContain('cursor-coworker doctor');
    expect(skill).toContain('Fall back once');
    expect(skill).not.toContain("cursor-coworker run");
    expect(skill).not.toContain("--retain-transcript");
  });
});
