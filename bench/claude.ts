import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ClaudeBenchmarkProvider = "claude-sonnet" | "claude-sonnet-subagents";

export interface ClaudeInvocationOptions {
  repo: string;
  commit: string;
  provider: ClaudeBenchmarkProvider;
  task: string;
  claudeExecutable?: string;
  timeoutMs?: number;
}

export interface ClaudeInvocationResult {
  provider: ClaudeBenchmarkProvider;
  status: "completed" | "failed";
  taskStatus: "completed" | "failed";
  summary: string;
  evidence: Array<{ kind: "file" | "symbol" | "command" | "test" | "other"; value: string; detail?: string }>;
  durationMs: number;
  sessionId?: string;
  workspaceChanged: boolean;
  usage: {
    state: "observed" | "unknown";
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    coverage?: "complete" | "parent-only";
  };
  warnings: string[];
}

interface ClaudeJsonResult {
  result?: unknown;
  session_id?: unknown;
  duration_ms?: unknown;
  total_cost_usd?: unknown;
  is_error?: unknown;
  structured_output?: unknown;
  usage?: {
    input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    output_tokens?: unknown;
  };
}

const resultSchema = JSON.stringify({
  type: "object",
  properties: {
    summary: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { enum: ["file", "symbol", "command", "test", "other"] },
          value: { type: "string" },
          detail: { type: "string" }
        },
        required: ["kind", "value"],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "evidence"],
  additionalProperties: false
});

function structured(value: unknown): { summary: string; evidence: ClaudeInvocationResult["evidence"] } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { summary?: unknown; evidence?: unknown };
  if (typeof candidate.summary !== "string" || !Array.isArray(candidate.evidence)) return undefined;
  return { summary: candidate.summary, evidence: candidate.evidence as ClaudeInvocationResult["evidence"] };
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function claudeArgs(provider: ClaudeBenchmarkProvider, task: string): string[] {
  const args = [
    "--print", task, "--output-format", "json", "--model", "sonnet",
    "--safe-mode", "--permission-mode", "dontAsk", "--no-session-persistence",
    "--json-schema", resultSchema, "--tools",
    provider === "claude-sonnet-subagents" ? "Read,Glob,Grep,Agent" : "Read,Glob,Grep"
  ];
  if (provider === "claude-sonnet-subagents") {
    args.push("--append-system-prompt", "Delegate repository exploration to subagents when useful. Keep every subagent read-only.");
  }
  return args;
}

export async function runClaudeInvocation(options: ClaudeInvocationOptions): Promise<ClaudeInvocationResult> {
  const disposable = await mkdtemp(join(tmpdir(), "cursor-coworker-claude-"));
  const workspace = join(disposable, "repo");
  const started = Date.now();
  try {
    await execFileAsync("git", ["clone", "--quiet", "--no-hardlinks", "--no-checkout", options.repo, workspace]);
    await execFileAsync("git", ["-C", workspace, "checkout", "--quiet", "--detach", options.commit]);
    await execFileAsync("git", ["-C", workspace, "remote", "remove", "origin"]);
    let stdout = "";
    let processFailed = false;
    const warnings: string[] = [];
    try {
      ({ stdout } = await execFileAsync(
        options.claudeExecutable ?? "claude",
        claudeArgs(options.provider, options.task),
        { cwd: workspace, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}) }
      ));
    } catch (error) {
      processFailed = true;
      warnings.push(error instanceof Error ? error.message : String(error));
      const failed = error as { stdout?: unknown };
      if (typeof failed.stdout === "string") stdout = failed.stdout;
    }
    let parsed: ClaudeJsonResult = {};
    try {
      if (stdout) parsed = JSON.parse(stdout) as ClaudeJsonResult;
    } catch {
      processFailed = true;
      warnings.push("Claude returned malformed JSON");
    }
    const content = structured(parsed.structured_output);
    const { stdout: status } = await execFileAsync("git", ["-C", workspace, "status", "--porcelain"], { encoding: "utf8" });
    const input = numeric(parsed.usage?.input_tokens);
    const cacheRead = numeric(parsed.usage?.cache_read_input_tokens);
    const cacheWrite = numeric(parsed.usage?.cache_creation_input_tokens);
    const output = numeric(parsed.usage?.output_tokens);
    const usageObserved = parsed.usage !== undefined;
    const technicalStatus = processFailed || parsed.is_error === true ? "failed" : "completed";
    return {
      provider: options.provider,
      status: technicalStatus,
      taskStatus: technicalStatus === "completed" && Boolean(content?.summary ?? parsed.result) ? "completed" : "failed",
      summary: content?.summary ?? (typeof parsed.result === "string" ? parsed.result : ""),
      evidence: content?.evidence ?? [],
      durationMs: numeric(parsed.duration_ms) || Date.now() - started,
      ...(typeof parsed.session_id === "string" ? { sessionId: parsed.session_id } : {}),
      workspaceChanged: status.trim().length > 0,
      usage: usageObserved ? {
        state: "observed",
        inputTokens: input + cacheRead + cacheWrite,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        totalTokens: input + cacheRead + cacheWrite + output,
        coverage: options.provider === "claude-sonnet-subagents" ? "parent-only" : "complete",
        ...(typeof parsed.total_cost_usd === "number" ? { costUsd: parsed.total_cost_usd } : {})
      } : { state: "unknown" },
      warnings
    };
  } finally {
    await rm(disposable, { recursive: true, force: true });
  }
}
