import { expect, it } from "vitest";
import { validateBenchmarkRecord } from "../bench/score.js";

it("accepts a complete scored run", () => {
  expect(validateBenchmarkRecord({
    caseId: "architecture-1", path: "cursor-auto", repetition: 1,
    primaryInputTokens: 1200, cursorUsageState: "unknown", latencyMs: 5000,
    factualScore: 4, evidenceScore: 4, reopenedSources: false, criticalError: false
  }).caseId).toBe("architecture-1");
});

it("rejects out-of-range blind scores", () => {
  expect(() => validateBenchmarkRecord({
    caseId: "x", path: "cursor-auto", repetition: 1, primaryInputTokens: 1,
    cursorUsageState: "unknown", latencyMs: 1, factualScore: 6,
    evidenceScore: 4, reopenedSources: false, criticalError: false
  })).toThrow("factualScore must be between 0 and 5");
});
