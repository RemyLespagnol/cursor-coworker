import { execCapture, type Exec } from "../cursor/doctor.js";

export interface WorkspaceSnapshot { status: string }

export async function observeWorkspace(
  cwd: string,
  exec: Exec = execCapture
): Promise<WorkspaceSnapshot | undefined> {
  const result = await exec("git", ["-C", cwd, "status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.code !== 0) return undefined;
  return { status: result.stdout.trimEnd() };
}
