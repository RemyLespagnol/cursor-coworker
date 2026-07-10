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

it("normalizes a non-zero execution as a stable failure envelope", () => {
  expect(normalizeResult({ mode: "analyze", requestedModel: "auto", exitCode: 1, stderr: "denied" }))
    .toMatchObject({ status: { technical: "failed", task: "failed" }, summary: "denied", execution: { exitCode: 1 } });
});

it("rejects invalid evidence entries and invalid durations with warnings", () => {
  const result = normalizeResult({
    mode: "analyze", requestedModel: "auto", exitCode: 0, stderr: "",
    terminal: { type: "result", subtype: "success", duration_ms: "nope", result: 'ok\nEVIDENCE_JSON:[{"kind":"nope","value":"x"},{"kind":"file","value":"x","detail":3}]' }
  });
  expect(result.evidence).toEqual([]);
  expect(result.execution.durationMs).toBe(0);
  expect(result.warnings).toEqual(expect.arrayContaining([
    "Cursor result contained invalid evidence entries",
    "Cursor result contained an invalid duration"
  ]));
});
