import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("uses safe defaults", () => {
    expect(resolveConfig({}, {}, "/repo")).toMatchObject({
      cwd: "/repo",
      model: "auto",
      sandbox: true,
      retainTranscript: false,
      timeoutMs: 300_000
    });
  });

  it("applies CLI values over environment values", () => {
    const env = { CURSOR_COWORKER_MODEL: "composer-2.5", CURSOR_COWORKER_TIMEOUT_MS: "9000" };
    const cli = { model: "auto", timeoutMs: 1000, sandbox: false, retainTranscript: true };
    expect(resolveConfig(cli, env, "/repo")).toMatchObject({
      model: "auto", timeoutMs: 1000, sandbox: false, retainTranscript: true
    });
  });

  it("rejects invalid positive integers", () => {
    expect(() => resolveConfig({}, { CURSOR_COWORKER_TIMEOUT_MS: "zero" }, "/repo"))
      .toThrow("CURSOR_COWORKER_TIMEOUT_MS must be a positive integer");
  });
});
