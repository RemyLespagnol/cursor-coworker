import { expect, it } from "vitest";
import { buildCursorArgs } from "../src/cursor/adapter.js";

const config = {
  cwd: "/repo", model: "auto", sandbox: true, retainTranscript: false,
  timeoutMs: 1000, cursorExecutable: "cursor-agent"
};

it("builds a read-only analyze invocation", () => {
  expect(buildCursorArgs("analyze", "trace auth", config)).toEqual([
    "--print", "--output-format", "stream-json", "--mode", "ask",
    "--model", "auto", "--workspace", "/repo", "--trust", "trace auth"
  ]);
});

it("builds a sandboxed direct-write invocation", () => {
  expect(buildCursorArgs("run", "fix auth", config)).toEqual([
    "--print", "--output-format", "stream-json", "--force", "--sandbox", "enabled",
    "--model", "auto", "--workspace", "/repo", "--trust", "fix auth"
  ]);
});
