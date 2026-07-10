import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runProcess } from "../src/execution/process.js";

const executable = process.execPath;
const fixture = fileURLToPath(new URL("./fixtures/fake-cursor.mjs", import.meta.url));

it("parses NDJSON and returns the terminal event", async () => {
  const result = await runProcess({ executable, args: [fixture], timeoutMs: 1000, env: {} });
  expect(result).toMatchObject({ exitCode: 0, terminal: { type: "result", result: "done" } });
});

it("rejects malformed NDJSON", async () => {
  await expect(runProcess({ executable, args: [fixture], timeoutMs: 1000, env: { FAKE_CURSOR_SCENARIO: "malformed" } }))
    .rejects.toThrow("Cursor emitted invalid NDJSON");
});

it("terminates a timed-out process", async () => {
  await expect(runProcess({ executable, args: [fixture], timeoutMs: 30, env: { FAKE_CURSOR_SCENARIO: "hang" } }))
    .rejects.toThrow("Cursor execution timed out after 30ms");
});

it("propagates caller cancellation", async () => {
  const controller = new AbortController();
  const pending = runProcess({
    executable, args: [fixture], timeoutMs: 1000,
    env: { FAKE_CURSOR_SCENARIO: "hang" }, signal: controller.signal
  });
  controller.abort();
  await expect(pending).rejects.toThrow("Cursor execution interrupted");
});
