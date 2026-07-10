import { expect, it } from "vitest";
import { buildTaskPrompt } from "../src/tasks/contracts.js";

it("forbids writes in analysis and requests evidence", () => {
  const prompt = buildTaskPrompt("analyze", "trace authentication");
  expect(prompt).toContain("Do not modify files or run commands that change state");
  expect(prompt).toContain("EVIDENCE_JSON");
  expect(prompt).toContain("trace authentication");
});

it("requires verification reporting for writes", () => {
  expect(buildTaskPrompt("run", "fix authentication")).toContain("Report verification commands and outcomes");
});
