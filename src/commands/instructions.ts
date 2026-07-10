export type InstructionTarget = "claude" | "codex";

export function generateInstructions(target: InstructionTarget): string {
  const host = target === "claude" ? "Claude Code" : "Codex";
  return `## Cursor Coworker\n\nWhen ${host} faces context-heavy repository reading, it may delegate with \`cursor-coworker analyze --task "<bounded question>" --cwd "$PWD"\`. Use \`cursor-coworker run\` only when the user or current workflow has authorized direct file changes. Consume the compact JSON result; do not request the raw Cursor transcript. The current workflow remains responsible for Git isolation, concurrency, verification, and review.`;
}
