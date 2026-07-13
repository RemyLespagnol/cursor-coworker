import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillHost, SkillInstallResult, SkillScope } from "../types.js";

export interface InstallSkillRequest {
  host: SkillHost;
  scope: SkillScope;
  cwd?: string;
}

export interface InstallSkillDeps {
  processCwd?: string;
  userHome?: string;
  assetPath?: string;
}

const hostDirectory: Record<SkillHost, string[]> = {
  codex: [".agents", "skills", "cursor-coworker", "SKILL.md"],
  claude: [".claude", "skills", "cursor-coworker", "SKILL.md"]
};

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function installSkill(
  request: InstallSkillRequest,
  deps: InstallSkillDeps = {}
): SkillInstallResult {
  const base = request.scope === "project"
    ? resolve(request.cwd ?? deps.processCwd ?? process.cwd())
    : resolve(deps.userHome ?? homedir());
  const destination = join(base, ...hostDirectory[request.host]);
  const assetPath = deps.assetPath
    ?? fileURLToPath(new URL("../../skills/cursor-coworker/SKILL.md", import.meta.url));
  const contents = readFileSync(assetPath);

  mkdirSync(dirname(destination), { recursive: true });
  let handle: number | undefined;
  try {
    handle = openSync(destination, "wx", 0o644);
    writeFileSync(handle, contents);
    closeSync(handle);
    handle = undefined;
  } catch (error) {
    if (handle !== undefined) {
      try { closeSync(handle); } catch { /* preserve the original error */ }
      rmSync(destination, { force: true });
    }
    if (codeOf(error) === "EEXIST") throw new Error(`Skill already exists: ${destination}`);
    throw error;
  }

  return {
    schemaVersion: 1,
    status: "installed",
    host: request.host,
    scope: request.scope,
    path: destination
  };
}
