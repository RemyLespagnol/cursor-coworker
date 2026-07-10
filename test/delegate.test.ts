import { expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delegate } from "../src/commands/delegate.js";

it("observes writes before and after and returns one envelope", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-coworker-"));
  const run = vi.fn().mockResolvedValue({
    exitCode: 0, stderr: "", events: [],
    terminal: { type: "result", subtype: "success", result: "done\nEVIDENCE_JSON:[]", duration_ms: 2 }
  });
  const observe = vi.fn().mockResolvedValueOnce({ status: "" }).mockResolvedValueOnce({ status: " M src/a.ts" });
  const result = await delegate({ mode: "run", task: "change a", cli: {}, env: {}, processCwd: cwd }, { run, observe });
  expect(result.changes).toEqual({ available: true, before: "", after: " M src/a.ts" });
});

it("observes writes after an execution failure and returns a failure envelope", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-coworker-"));
  const run = vi.fn().mockRejectedValue(new Error("Cursor execution timed out after 30ms"));
  const observe = vi.fn().mockResolvedValueOnce({ status: "" }).mockResolvedValueOnce({ status: " M partial.ts" });
  const result = await delegate({ mode: "run", task: "change a", cli: {}, env: {}, processCwd: cwd }, { run, observe });
  expect(result).toMatchObject({
    status: { technical: "failed", task: "failed" }, summary: "Cursor execution timed out after 30ms",
    changes: { available: true, before: "", after: " M partial.ts" }
  });
});

it("rejects a missing working directory before execution", async () => {
  const run = vi.fn();
  await expect(delegate({ mode: "analyze", task: "read", cli: {}, env: {}, processCwd: join(tmpdir(), "missing-cursor-coworker") }, { run }))
    .rejects.toThrow("Working directory does not exist");
  expect(run).not.toHaveBeenCalled();
});

it("preserves the result when post-run observation fails", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-coworker-"));
  const run = vi.fn().mockResolvedValue({
    exitCode: 0, stderr: "", events: [],
    terminal: { type: "result", subtype: "success", result: "done\nEVIDENCE_JSON:[]", duration_ms: 2 }
  });
  const observe = vi.fn().mockResolvedValueOnce({ status: "" }).mockRejectedValueOnce(new Error("git unavailable"));
  const result = await delegate({ mode: "run", task: "change a", cli: {}, env: {}, processCwd: cwd }, { run, observe });
  expect(result.changes).toEqual({ available: false, before: "" });
  expect(result.warnings).toContain("Could not observe workspace after execution: git unavailable");
});
