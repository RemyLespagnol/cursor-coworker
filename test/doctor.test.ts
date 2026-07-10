import { expect, it, vi } from "vitest";
import { runDoctor } from "../src/cursor/doctor.js";

const config = {
  cwd: "/repo", model: "auto", sandbox: true, retainTranscript: false,
  timeoutMs: 1000, cursorExecutable: "cursor-agent"
};

it("reports version, authentication, and model availability", async () => {
  const exec = vi.fn()
    .mockResolvedValueOnce({ code: 0, stdout: "2026.06.16", stderr: "" })
    .mockResolvedValueOnce({ code: 0, stdout: '{"isAuthenticated":true}', stderr: "" })
    .mockResolvedValueOnce({ code: 0, stdout: "auto - Auto\ncomposer-2.5 - Composer", stderr: "" });
  await expect(runDoctor(config, exec)).resolves.toMatchObject({
    ok: true, version: "2026.06.16", authenticated: true, modelAvailable: true
  });
});
