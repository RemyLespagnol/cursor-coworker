import type { DelegateMode } from "../types.js";

const outputContract = `Return a compact final answer. End with exactly one line beginning EVIDENCE_JSON: followed by a JSON array. Each item has kind (file, symbol, command, test, or other), value, and optional detail. Cite only evidence you actually inspected.`;

export function buildTaskPrompt(mode: DelegateMode, task: string): string {
  const permission = mode === "analyze"
    ? "Do not modify files or run commands that change state."
    : "Modify the requested files directly. Report verification commands and outcomes. Do not create branches, commits, patches, or worktrees.";
  return `${permission}\n${outputContract}\n\nTASK:\n${task}`;
}
