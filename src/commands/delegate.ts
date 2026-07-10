import { join } from "node:path";
import { mkdirSync, statSync } from "node:fs";
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
  let workspace;
  try { workspace = statSync(config.cwd); }
  catch { throw new Error(`Working directory does not exist: ${config.cwd}`); }
  if (!workspace.isDirectory()) throw new Error(`Working directory is not a directory: ${config.cwd}`);
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
  const startedAt = Date.now();
  let processResult;
  let failure: unknown;
  try {
    processResult = await run({
      executable: config.cursorExecutable,
      args: buildCursorArgs(request.mode, prompt, config),
      timeoutMs: config.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(transcriptPath ? { transcriptPath } : {})
    });
  } catch (error) { failure = error; }
  let after;
  let observationWarning: string | undefined;
  if (request.mode === "run") {
    try { after = await observe(config.cwd); }
    catch (error) {
      observationWarning = `Could not observe workspace after execution: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const warnings = [
    ...(!config.sandbox && request.mode === "run" ? ["Cursor sandbox was explicitly disabled"] : []),
    ...(before?.status ? ["Workspace was dirty before execution"] : []),
    ...(transcriptPath ? [`Raw transcript retained at ${transcriptPath}`] : []),
    ...(observationWarning ? [observationWarning] : [])
  ];
  return normalizeResult({
    mode: request.mode,
    requestedModel: config.model,
    exitCode: processResult?.exitCode ?? null,
    stderr: processResult?.stderr ?? "",
    ...(processResult?.terminal ? { terminal: processResult.terminal } : {}),
    ...(failure ? { failureMessage: failure instanceof Error ? failure.message : String(failure) } : {}),
    ...(failure && (failure instanceof Error ? failure.message : String(failure)).includes("interrupted") ? { interrupted: true } : {}),
    ...(failure ? { durationMs: Date.now() - startedAt } : {}),
    ...(before ? { before: before.status } : {}),
    ...(after ? { after: after.status } : {}),
    warnings
  });
}
