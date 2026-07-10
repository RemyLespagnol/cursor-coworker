import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { resolveConfig, type CliConfigInput } from "../config.js";
import { buildCursorArgs } from "../cursor/adapter.js";
import { runProcess } from "../execution/process.js";
import { normalizeResult } from "../execution/normalize.js";
import { buildTaskPrompt } from "../tasks/contracts.js";
import { observeWorkspace } from "../workspace/observer.js";
import type { DelegateMode, ResultEnvelope } from "../types.js";

export interface DelegateRequest {
  mode: DelegateMode;
  task: string;
  cli: CliConfigInput;
  env?: NodeJS.ProcessEnv;
  processCwd?: string;
  signal?: AbortSignal;
}

export interface DelegateDeps {
  run?: typeof runProcess;
  observe?: typeof observeWorkspace;
}

export async function delegate(request: DelegateRequest, deps: DelegateDeps = {}): Promise<ResultEnvelope> {
  const config = resolveConfig(request.cli, request.env, request.processCwd);
  const run = deps.run ?? runProcess;
  const observe = deps.observe ?? observeWorkspace;
  const before = request.mode === "run" ? await observe(config.cwd) : undefined;
  let transcriptPath: string | undefined;
  if (config.retainTranscript) {
    const directory = join(config.cwd, ".cursor-coworker");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    transcriptPath = join(directory, `transcript-${Date.now()}.jsonl`);
  }
  const prompt = buildTaskPrompt(request.mode, request.task);
  const processResult = await run({
    executable: config.cursorExecutable,
    args: buildCursorArgs(request.mode, prompt, config),
    timeoutMs: config.timeoutMs,
    ...(request.signal ? { signal: request.signal } : {}),
    ...(transcriptPath ? { transcriptPath } : {})
  });
  const after = request.mode === "run" ? await observe(config.cwd) : undefined;
  const warnings = [
    ...(!config.sandbox && request.mode === "run" ? ["Cursor sandbox was explicitly disabled"] : []),
    ...(before?.status ? ["Workspace was dirty before execution"] : []),
    ...(transcriptPath ? [`Raw transcript retained at ${transcriptPath}`] : [])
  ];
  return normalizeResult({
    mode: request.mode,
    requestedModel: config.model,
    exitCode: processResult.exitCode,
    stderr: processResult.stderr,
    ...(processResult.terminal ? { terminal: processResult.terminal } : {}),
    ...(before ? { before: before.status } : {}),
    ...(after ? { after: after.status } : {}),
    warnings
  });
}
