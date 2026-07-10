import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

it.skipIf(process.platform === "win32")("waits for graceful child close before settling a timeout", async () => {
  const startedAt = Date.now();
  await expect(runProcess({ executable, args: [fixture], timeoutMs: 100, env: { FAKE_CURSOR_SCENARIO: "slow-stop" } }))
    .rejects.toThrow("Cursor execution timed out after 100ms");
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(180);
});

it("does not spawn when the caller signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(runProcess({ executable: "definitely-missing", args: [], timeoutMs: 1000, signal: controller.signal }))
    .rejects.toThrow("Cursor execution interrupted");
});

it("settles a timeout only after the child is gone", async () => {
  const pidFile = join(mkdtempSync(join(tmpdir(), "cursor-coworker-process-")), "pid");
  await expect(runProcess({
    executable, args: [fixture], timeoutMs: 200,
    env: { FAKE_CURSOR_SCENARIO: "hang", FAKE_CURSOR_PID_FILE: pidFile }
  })).rejects.toThrow("Cursor execution timed out after 200ms");
  const pid = Number(readFileSync(pidFile, "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
});
