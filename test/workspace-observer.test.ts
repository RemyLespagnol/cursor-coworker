import { expect, it, vi } from "vitest";
import { observeWorkspace } from "../src/workspace/observer.js";

it("captures porcelain status without changing the repository", async () => {
  const exec = vi.fn().mockResolvedValue({ code: 0, stdout: " M src/a.ts\n", stderr: "" });
  await expect(observeWorkspace("/repo", exec)).resolves.toEqual({ status: " M src/a.ts" });
  expect(exec).toHaveBeenCalledWith("git", ["-C", "/repo", "status", "--porcelain=v1", "--untracked-files=all"]);
});

it("returns undefined outside a Git repository", async () => {
  const exec = vi.fn().mockResolvedValue({ code: 128, stdout: "", stderr: "not a repository" });
  await expect(observeWorkspace("/tmp", exec)).resolves.toBeUndefined();
});
