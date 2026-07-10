import { expect, it, vi } from "vitest";
import { delegate } from "../src/commands/delegate.js";

it("observes writes before and after and returns one envelope", async () => {
  const run = vi.fn().mockResolvedValue({
    exitCode: 0, stderr: "", events: [],
    terminal: { type: "result", subtype: "success", result: "done\nEVIDENCE_JSON:[]", duration_ms: 2 }
  });
  const observe = vi.fn().mockResolvedValueOnce({ status: "" }).mockResolvedValueOnce({ status: " M src/a.ts" });
  const result = await delegate({ mode: "run", task: "change a", cli: {}, env: {}, processCwd: "/repo" }, { run, observe });
  expect(result.changes).toEqual({ available: true, before: "", after: " M src/a.ts" });
});
