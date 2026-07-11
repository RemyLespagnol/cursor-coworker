#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { delegate as delegateCommand, type DelegateRequest } from "../src/commands/delegate.js";
import type { ResultEnvelope } from "../src/types.js";
import { runClaudeInvocation, type ClaudeBenchmarkProvider, type ClaudeInvocationOptions, type ClaudeInvocationResult } from "./claude.js";

const execFileAsync = promisify(execFile);

export interface ReadonlyBenchmarkCase {
  id: string;
  category: string;
  task: string;
}

export interface BenchmarkRunOptions {
  repo: string;
  outputDir: string;
  models: string[];
  providers?: ClaudeBenchmarkProvider[];
  repetitions: number;
  cases: ReadonlyBenchmarkCase[];
  timeoutMs?: number;
  cursorExecutable?: string;
  claudeExecutable?: string;
}

interface RepoSnapshot { commit: string; status: string }

interface BenchmarkDeps {
  delegate?: (request: DelegateRequest) => Promise<ResultEnvelope>;
  invokeClaude?: (options: ClaudeInvocationOptions) => Promise<ClaudeInvocationResult>;
  snapshotRepo?: (repo: string) => Promise<RepoSnapshot>;
}

export interface BenchmarkReport {
  schemaVersion: 1;
  target: { path: string; commit: string; unchanged: boolean };
  configuration: { models: string[]; providers?: string[]; repetitions: number; cases: string[] };
  runs: Array<{
    caseId: string;
    category: string;
    provider: string;
    model: string;
    repetition: number;
    status: string;
    taskStatus: string;
    latencyMs: number;
    evidenceCount: number;
    usageState: string;
    output: string;
  }>;
}

async function snapshotRepo(repo: string): Promise<RepoSnapshot> {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }),
    execFileAsync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" })
  ]);
  return { commit: commit.trim(), status: status.trim() };
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

const supportedProviders = new Set<ClaudeBenchmarkProvider>(["claude-sonnet", "claude-sonnet-subagents"]);

export function parseProviders(value: string | undefined): ClaudeBenchmarkProvider[] | undefined {
  if (value === undefined) return undefined;
  const providers = value.split(",").map(item => item.trim()).filter(Boolean);
  if (providers.length === 0) throw new Error("--providers must contain at least one provider");
  if (providers.some(provider => !supportedProviders.has(provider as ClaudeBenchmarkProvider))) {
    throw new Error("--providers supports claude-sonnet,claude-sonnet-subagents");
  }
  return providers as ClaudeBenchmarkProvider[];
}

export function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

export function benchmarkSucceeded(runs: Array<{ status: string; taskStatus: string }>): boolean {
  return runs.every(run => run.status === "completed" && run.taskStatus === "completed");
}

export async function runBenchmark(options: BenchmarkRunOptions, deps: BenchmarkDeps = {}): Promise<BenchmarkReport> {
  const repo = resolve(options.repo);
  const outputDir = resolve(options.outputDir);
  const observe = deps.snapshotRepo ?? snapshotRepo;
  const invoke = deps.delegate ?? (request => delegateCommand(request));
  const invokeClaude = deps.invokeClaude ?? runClaudeInvocation;
  const initial = await observe(repo);
  if (initial.status) throw new Error("Target repository must be clean before benchmarking");
  mkdirSync(outputDir, { recursive: true });

  const report: BenchmarkReport = {
    schemaVersion: 1,
    target: { path: repo, commit: initial.commit, unchanged: true },
    configuration: {
      models: options.providers ? ["sonnet"] : [...options.models],
      ...(options.providers ? { providers: [...options.providers] } : {}),
      repetitions: options.repetitions,
      cases: options.cases.map(item => item.id)
    },
    runs: []
  };

  for (const item of options.cases) {
    if (options.providers) {
      for (const provider of options.providers) {
        for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
          const started = Date.now();
          let result: ClaudeInvocationResult;
          try {
            result = await invokeClaude({
              repo,
              commit: initial.commit,
              provider,
              task: item.task,
              ...(options.claudeExecutable ? { claudeExecutable: options.claudeExecutable } : {}),
              ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
            });
          } catch (error) {
            result = {
              provider,
              status: "failed",
              taskStatus: "failed",
              summary: "",
              evidence: [],
              durationMs: Date.now() - started,
              workspaceChanged: false,
              usage: { state: "unknown" },
              warnings: [error instanceof Error ? error.message : String(error)]
            };
          }
          const filename = `${safeName(item.id)}-${safeName(provider)}-${repetition}.json`;
          writeFileSync(join(outputDir, filename), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
          const current = await observe(repo);
          if (current.commit !== initial.commit || current.status !== initial.status) {
            report.target.unchanged = false;
            throw new Error("Target repository changed during benchmark");
          }
          report.runs.push({
            caseId: item.id,
            category: item.category,
            provider,
            model: "sonnet",
            repetition,
            status: result.status,
            taskStatus: result.taskStatus,
            latencyMs: result.durationMs,
            evidenceCount: result.evidence.length,
            usageState: provider === "claude-sonnet-subagents" && result.usage.state === "observed"
              ? "observed-incomplete"
              : result.usage.state,
            output: filename
          });
        }
      }
      continue;
    }
    for (const model of options.models) {
      for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
        const started = Date.now();
        let result: ResultEnvelope;
        try {
          result = await invoke({
            mode: "analyze",
            task: item.task,
            cli: {
              cwd: repo,
              model,
              ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
              ...(options.cursorExecutable === undefined ? {} : { cursorExecutable: options.cursorExecutable })
            }
          });
        } catch (error) {
          result = {
            schemaVersion: 1,
            status: { technical: "failed", task: "failed" },
            summary: "",
            evidence: [],
            changes: { available: false },
            execution: {
              mode: "analyze",
              requestedModel: model,
              durationMs: Date.now() - started,
              exitCode: null
            },
            usage: { state: "unknown" },
            warnings: [error instanceof Error ? error.message : String(error)]
          };
        }
        const filename = `${safeName(item.id)}-${safeName(model)}-${repetition}.json`;
        writeFileSync(join(outputDir, filename), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
        const current = await observe(repo);
        if (current.commit !== initial.commit || current.status !== initial.status) {
          report.target.unchanged = false;
          throw new Error("Target repository changed during benchmark");
        }
        report.runs.push({
          caseId: item.id,
          category: item.category,
          provider: `cursor-${model}`,
          model,
          repetition,
          status: result.status.technical,
          taskStatus: result.status.task,
          latencyMs: result.execution.durationMs,
          evidenceCount: result.evidence.length,
          usageState: result.usage.state,
          output: filename
        });
      }
    }
  }

  writeFileSync(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

function loadCases(path: string): ReadonlyBenchmarkCase[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(value) || value.length === 0) throw new Error("benchmark cases must be a non-empty array");
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) throw new Error(`benchmark case ${index + 1} must be an object`);
    const candidate = item as Record<string, unknown>;
    for (const field of ["id", "category", "task"] as const) {
      if (typeof candidate[field] !== "string" || !candidate[field]) throw new Error(`benchmark case ${index + 1} requires ${field}`);
    }
    return { id: candidate.id as string, category: candidate.category as string, task: candidate.task as string };
  });
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        repo: { type: "string" }, cases: { type: "string" }, models: { type: "string" }, providers: { type: "string" },
        repetitions: { type: "string" }, output: { type: "string" }, timeout: { type: "string" },
        "cursor-path": { type: "string" }, "claude-path": { type: "string" }
      },
      strict: true
    });
    if (!parsed.values.repo) throw new Error("--repo is required");
    const repetitions = parsePositiveInteger(parsed.values.repetitions ?? "3", "--repetitions");
    const models = (parsed.values.models ?? "auto,composer-2.5").split(",").map(value => value.trim()).filter(Boolean);
    if (models.length === 0) throw new Error("--models must contain at least one model");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const casesPath = resolve(parsed.values.cases ?? fileURLToPath(new URL("./cases.readonly.json", import.meta.url)));
    const providers = parseProviders(parsed.values.providers);
    const timeoutMs = parsed.values.timeout === undefined ? undefined : parsePositiveInteger(parsed.values.timeout, "--timeout");
    const report = await runBenchmark({
      repo: parsed.values.repo,
      outputDir: parsed.values.output ?? resolve(".benchmark-results", timestamp),
      models,
      ...(providers ? { providers } : {}),
      repetitions,
      cases: loadCases(casesPath),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(parsed.values["cursor-path"] ? { cursorExecutable: parsed.values["cursor-path"] } : {}),
      ...(parsed.values["claude-path"] ? { claudeExecutable: parsed.values["claude-path"] } : {})
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return benchmarkSucceeded(report.runs) ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
