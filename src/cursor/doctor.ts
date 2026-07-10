import { spawn } from "node:child_process";
import type { ResolvedConfig } from "../types.js";

export interface ExecResult { code: number | null; stdout: string; stderr: string }
export type Exec = (file: string, args: string[]) => Promise<ExecResult>;

export interface DoctorReport {
  ok: boolean;
  version?: string;
  authenticated: boolean;
  modelAvailable: boolean;
  problems: string[];
}

export const execCapture: Exec = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", code => resolve({ code, stdout, stderr }));
});

export async function runDoctor(config: ResolvedConfig, exec: Exec = execCapture): Promise<DoctorReport> {
  const problems: string[] = [];
  const versionResult = await exec(config.cursorExecutable, ["--version"]);
  if (versionResult.code !== 0) problems.push("Cursor Agent CLI is unavailable");

  const statusResult = await exec(config.cursorExecutable, ["status", "--format", "json"]);
  let authenticated = false;
  try { authenticated = JSON.parse(statusResult.stdout).isAuthenticated === true; } catch { authenticated = false; }
  if (!authenticated) problems.push("Cursor Agent is not authenticated; run cursor-agent login");

  const modelsResult = await exec(config.cursorExecutable, ["models"]);
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
