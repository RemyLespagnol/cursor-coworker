import { expect, it } from "vitest";
import { validateBenchmarkRecord, validateBenchmarkRecords } from "../bench/score.js";

it("accepts a complete scored run", () => {
  expect(validateBenchmarkRecord({
    caseId: "architecture-1", path: "cursor-auto", repetition: 1,
    primaryInputTokens: 1200, cursorUsageState: "unknown", latencyMs: 5000,
    factualScore: 4, evidenceScore: 4, reopenedSources: false, criticalError: false
  }).caseId).toBe("architecture-1");
});

it("rejects invalid record fields and non-array input", () => {
  const valid = {
    caseId: "x", path: "cursor-auto", repetition: 1, primaryInputTokens: 1,
    cursorUsageState: "unknown", latencyMs: 1, factualScore: 4,
    evidenceScore: 4, reopenedSources: false, criticalError: false
  };
  expect(() => validateBenchmarkRecord({ ...valid, path: "invalid" } as never)).toThrow("path is invalid");
  expect(() => validateBenchmarkRecord({ ...valid, reopenedSources: "no" } as never)).toThrow("reopenedSources must be a boolean");
  expect(() => validateBenchmarkRecord({ ...valid, cursorInputTokens: -1 } as never)).toThrow("cursorInputTokens must be non-negative");
  expect(() => validateBenchmarkRecords({})).toThrow("benchmark input must be an array");
});

it("rejects out-of-range blind scores", () => {
  expect(() => validateBenchmarkRecord({
    caseId: "x", path: "cursor-auto", repetition: 1, primaryInputTokens: 1,
    cursorUsageState: "unknown", latencyMs: 1, factualScore: 6,
    evidenceScore: 4, reopenedSources: false, criticalError: false
  })).toThrow("factualScore must be between 0 and 5");
});
