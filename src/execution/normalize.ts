import type { CursorEvent } from "./process.js";
import type { DelegateMode, EvidenceItem, ResultEnvelope } from "../types.js";

export interface NormalizeInput {
  mode: DelegateMode;
  requestedModel: string;
  exitCode: number | null;
  stderr: string;
  terminal?: CursorEvent;
  before?: string;
  after?: string;
  warnings?: string[];
  failureMessage?: string;
  interrupted?: boolean;
  durationMs?: number;
}

const evidenceKinds = new Set(["file", "symbol", "command", "test", "other"]);

function parseEvidence(text: string): { summary: string; evidence: EvidenceItem[]; warning?: string } {
  const marker = "\nEVIDENCE_JSON:";
  const index = text.lastIndexOf(marker);
  if (index < 0) return { summary: text.trim(), evidence: [], warning: "Cursor result omitted structured evidence" };
  const summary = text.slice(0, index).trim();
  try {
    const value = JSON.parse(text.slice(index + marker.length)) as unknown;
    if (!Array.isArray(value)) throw new Error("not an array");
    const evidence = value.filter((item): item is EvidenceItem => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.kind === "string" && evidenceKinds.has(candidate.kind) &&
        typeof candidate.value === "string" &&
        (candidate.detail === undefined || typeof candidate.detail === "string");
    });
    return { summary, evidence, ...(evidence.length === value.length ? {} : { warning: "Cursor result contained invalid evidence entries" }) };
  } catch {
    return { summary, evidence: [], warning: "Cursor result contained invalid structured evidence" };
  }
}

export function normalizeResult(input: NormalizeInput): ResultEnvelope {
  const succeeded = input.exitCode === 0 && input.terminal?.subtype === "success" && !input.failureMessage;
  const technical = input.interrupted ? "interrupted" : succeeded ? "completed" : "failed";
  const failureSummary = input.failureMessage ?? (input.stderr.trim() || "Cursor did not emit a terminal success event");
  const parsed = parseEvidence(String(input.terminal?.result ?? ""));
  const rawDuration = input.durationMs ?? input.terminal?.duration_ms ?? 0;
  const validDuration = typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration >= 0;
  const warnings = [
    ...(input.warnings ?? []),
    ...(succeeded && parsed.warning ? [parsed.warning] : []),
    ...(!validDuration ? ["Cursor result contained an invalid duration"] : [])
  ];
  return {
    schemaVersion: 1,
    status: { technical, task: succeeded ? (parsed.summary ? "completed" : "incomplete") : technical },
    summary: succeeded ? parsed.summary : failureSummary,
    evidence: succeeded ? parsed.evidence : [],
    changes: {
      available: input.before !== undefined && input.after !== undefined,
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {})
    },
    execution: {
      mode: input.mode,
      requestedModel: input.requestedModel,
      durationMs: validDuration ? rawDuration : 0,
      exitCode: input.exitCode,
      ...(typeof input.terminal?.session_id === "string" ? { sessionId: input.terminal.session_id } : {}),
      ...(typeof input.terminal?.request_id === "string" ? { requestId: input.terminal.request_id } : {})
    },
    usage: { state: "unknown" },
    warnings
  };
}
