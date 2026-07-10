import { resolve } from "node:path";
import type { ResolvedConfig } from "./types.js";

export interface CliConfigInput {
  cwd?: string;
  model?: string;
  sandbox?: boolean;
  retainTranscript?: boolean;
  timeoutMs?: number;
  cursorExecutable?: string;
}

function positiveInteger(value: string | number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function envBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`boolean environment value must be true, false, 1, or 0`);
}

export function resolveConfig(
  cli: CliConfigInput,
  env: NodeJS.ProcessEnv = process.env,
  processCwd = process.cwd()
): ResolvedConfig {
  return {
    cwd: resolve(cli.cwd ?? env.CURSOR_COWORKER_CWD ?? processCwd),
    model: cli.model ?? env.CURSOR_COWORKER_MODEL ?? "auto",
    sandbox: cli.sandbox ?? envBoolean(env.CURSOR_COWORKER_SANDBOX, true),
    retainTranscript: cli.retainTranscript ?? envBoolean(env.CURSOR_COWORKER_RETAIN_TRANSCRIPT, false),
    timeoutMs: positiveInteger(
      cli.timeoutMs ?? env.CURSOR_COWORKER_TIMEOUT_MS,
      "CURSOR_COWORKER_TIMEOUT_MS",
      300_000
    ),
    cursorExecutable: cli.cursorExecutable ?? env.CURSOR_COWORKER_CURSOR_PATH ?? "cursor-agent"
  };
}
