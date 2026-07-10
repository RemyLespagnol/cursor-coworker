import { spawn } from "node:child_process";
import type { ResolvedConfig } from "../types.js";

export interface ExecResult { code: number | null; stdout: string; stderr: string }
export type Exec = (file: string, args: string[], timeoutMs?: number) => Promise<ExecResult>;

export interface DoctorReport {
  ok: boolean;
  version?: string;
  authenticated: boolean;
  modelAvailable: boolean;
  problems: string[];
}

export const execCapture: Exec = (file, args, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  timer.unref();
  child.once("error", error => { clearTimeout(timer); reject(error); });
  child.once("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
});

function bounded(exec: Exec, file: string, args: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const pending = exec(file, args, timeoutMs);
    const timer = setTimeout(() => reject(new Error("probe timed out")), timeoutMs + 1_000);
    timer.unref();
    pending.then(
      result => { clearTimeout(timer); resolve(result); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

export async function runDoctor(config: ResolvedConfig, exec: Exec = execCapture): Promise<DoctorReport> {
  const problems: string[] = [];
  let versionResult: ExecResult;
  try { versionResult = await bounded(exec, config.cursorExecutable, ["--version"], Math.min(config.timeoutMs, 10_000)); }
  catch {
    return { ok: false, authenticated: false, modelAvailable: false, problems: ["Cursor Agent CLI is unavailable"] };
  }
  if (versionResult.code !== 0) return { ok: false, authenticated: false, modelAvailable: false, problems: ["Cursor Agent CLI is unavailable"] };

  let statusResult: ExecResult;
  try { statusResult = await bounded(exec, config.cursorExecutable, ["status", "--format", "json"], Math.min(config.timeoutMs, 10_000)); }
  catch { statusResult = { code: null, stdout: "", stderr: "probe failed" }; }
  let authenticated = false;
  try { authenticated = JSON.parse(statusResult.stdout).isAuthenticated === true; } catch { authenticated = false; }
  if (!authenticated) problems.push("Cursor Agent is not authenticated; run cursor-agent login");

  let modelsResult: ExecResult;
  try { modelsResult = await bounded(exec, config.cursorExecutable, ["models"], Math.min(config.timeoutMs, 10_000)); }
  catch { modelsResult = { code: null, stdout: "", stderr: "probe failed" }; }
  const modelAvailable = modelsResult.code === 0 &&
    modelsResult.stdout.split("\n").some(line => line.startsWith(`${config.model} -`));
  if (!modelAvailable) problems.push(`Requested model is unavailable: ${config.model}`);

  return {
    ok: problems.length === 0,
    ...(versionResult.code === 0 ? { version: versionResult.stdout.trim() } : {}),
    authenticated,
    modelAvailable,
    problems
  };
}
