import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fake = "bench/fake-cursor-coworker.mjs";
const cases = JSON.parse(readFileSync("bench/cases.skill-trigger.json", "utf8")) as Array<{
  id: string;
  shouldDelegate: boolean;
  prompt: string;
}>;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("skill trigger experiment fixtures", () => {
  it("contains ten positive and ten negative unique cases", () => {
    expect(cases.filter(item => item.shouldDelegate)).toHaveLength(10);
    expect(cases.filter(item => !item.shouldDelegate)).toHaveLength(10);
    expect(new Set(cases.map(item => item.id)).size).toBe(20);
    expect(cases.every(item => item.prompt.length > 20)).toBe(true);
  });

  it("records analyze and emits a usable result envelope", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-trigger-"));
    roots.push(root);
    const log = join(root, "calls.jsonl");
    const result = spawnSync("node", [
      fake, "analyze", "--task", "Trace authentication", "--cwd", root
    ], {
      encoding: "utf8",
      env: { ...process.env, CURSOR_COWORKER_TRIGGER_LOG: log }
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: { technical: "completed", task: "completed" }
    });
    expect(JSON.parse(readFileSync(log, "utf8").trim())).toEqual({
      command: "analyze",
      args: ["--task", "Trace authentication", "--cwd", root]
    });
  });

  it("records but refuses every command other than analyze", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-trigger-"));
    roots.push(root);
    const log = join(root, "calls.jsonl");
    const result = spawnSync("node", [fake, "run", "--task", "edit"], {
      encoding: "utf8",
      env: { ...process.env, CURSOR_COWORKER_TRIGGER_LOG: log }
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("read-only");
    expect(JSON.parse(readFileSync(log, "utf8").trim()).command).toBe("run");
  });
});
