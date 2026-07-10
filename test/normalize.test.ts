import { expect, it } from "vitest";
import { normalizeResult } from "../src/execution/normalize.js";

it("normalizes a successful terminal event", () => {
  const result = normalizeResult({
    mode: "analyze", requestedModel: "auto", exitCode: 0, stderr: "", before: undefined, after: undefined,
    terminal: {
      type: "result", subtype: "success", duration_ms: 12, session_id: "s", request_id: "r",
      result: 'Summary text\nEVIDENCE_JSON:[{"kind":"file","value":"src/auth.ts"}]'
    }
  });
  expect(result).toMatchObject({
    schemaVersion: 1,
    status: { technical: "completed", task: "completed" },
    summary: "Summary text",
    evidence: [{ kind: "file", value: "src/auth.ts" }]
  });
});

it("refuses to normalize a non-zero or terminal-less execution", () => {
  expect(() => normalizeResult({ mode: "analyze", requestedModel: "auto", exitCode: 1, stderr: "denied" }))
    .toThrow("Cursor failed with exit code 1: denied");
});
