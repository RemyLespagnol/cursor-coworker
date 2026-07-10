import type { DelegateMode, ResolvedConfig } from "../types.js";

export function buildCursorArgs(mode: DelegateMode, task: string, config: ResolvedConfig): string[] {
  const permissionArgs = mode === "analyze"
    ? ["--mode", "ask"]
    : ["--force", "--sandbox", config.sandbox ? "enabled" : "disabled"];
  return [
    "--print", "--output-format", "stream-json", ...permissionArgs,
    "--model", config.model, "--workspace", config.cwd, "--trust", task
  ];
}
