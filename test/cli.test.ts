import { expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

it("prints generated Claude instructions", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const code = await main(["instructions", "claude"], { stdout, stderr });
  expect(code).toBe(0);
  expect(stdout.mock.calls[0]?.[0]).toContain("cursor-coworker analyze");
  expect(stderr).not.toHaveBeenCalled();
});

it("returns usage error without a task", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["analyze"], { stdout, stderr })).toBe(2);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--task is required"));
});
