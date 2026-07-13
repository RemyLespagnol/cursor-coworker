export type InstructionTarget = "claude" | "codex";

export function generateInstructions(target: InstructionTarget): string {
  if (target === "claude") {
    return "## Cursor Coworker delegation\n\nFor every bounded read-only repository question that requires broad synthesis, you must invoke /cursor-coworker exactly once before using direct repository exploration tools. Treat architecture explanation, tracing behavior across two or more modules, comparing components, locating an unknown implementation, and cross-cutting risk analysis as broad synthesis, even when existing repository context provides entry-point files or symbols. Keep a known-file or known-symbol lookup, trivial search, complete narrow answer already in context, editing task, or non-repository question local. Never invoke Cursor Coworker for edits.\n\nConsume the compact JSON result; do not request the raw Cursor transcript. The current workflow remains responsible for Git isolation, concurrency, verification, and review.";
  }

  return `## Cursor Coworker\n\nWhen Codex faces context-heavy repository reading, it may delegate with \`cursor-coworker analyze --task "<bounded question>" --cwd "$PWD"\`. Use \`cursor-coworker run\` only when the user or current workflow has authorized direct file changes. Consume the compact JSON result; do not request the raw Cursor transcript. The current workflow remains responsible for Git isolation, concurrency, verification, and review.`;
}
