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
}

function parseEvidence(text: string): { summary: string; evidence: EvidenceItem[]; warning?: string } {
  const marker = "\nEVIDENCE_JSON:";
  const index = text.lastIndexOf(marker);
  if (index < 0) return { summary: text.trim(), evidence: [], warning: "Cursor result omitted structured evidence" };
  const summary = text.slice(0, index).trim();
  try {
    const value = JSON.parse(text.slice(index + marker.length)) as unknown;
    if (!Array.isArray(value)) throw new Error("not an array");
    const evidence = value.filter((item): item is EvidenceItem =>
      typeof item === "object" && item !== null && typeof (item as EvidenceItem).kind === "string" && typeof (item as EvidenceItem).value === "string"
    );
    return { summary, evidence };
  } catch {
    return { summary, evidence: [], warning: "Cursor result contained invalid structured evidence" };
  }
}

export function normalizeResult(input: NormalizeInput): ResultEnvelope {
  if (input.exitCode !== 0 || !input.terminal || input.terminal.subtype !== "success") {
    throw new Error(`Cursor failed with exit code ${input.exitCode}: ${input.stderr.trim() || "missing terminal success event"}`);
  }
  const parsed = parseEvidence(String(input.terminal.result ?? ""));
  const warnings = [...(input.warnings ?? []), ...(parsed.warning ? [parsed.warning] : [])];
  return {
    schemaVersion: 1,
    status: { technical: "completed", task: parsed.summary ? "completed" : "incomplete" },
    summary: parsed.summary,
    evidence: parsed.evidence,
    changes: {
      available: input.before !== undefined && input.after !== undefined,
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {})
    },
    execution: {
      mode: input.mode,
      requestedModel: input.requestedModel,
      durationMs: Number(input.terminal.duration_ms ?? 0),
      exitCode: input.exitCode,
      ...(typeof input.terminal.session_id === "string" ? { sessionId: input.terminal.session_id } : {}),
      ...(typeof input.terminal.request_id === "string" ? { requestId: input.terminal.request_id } : {})
    },
    usage: { state: "unknown" },
    warnings
  };
}
