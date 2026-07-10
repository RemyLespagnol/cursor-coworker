# Cursor Coworker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate a public-ready CLI that delegates compact read-only analysis and bounded write tasks to an existing authenticated Cursor Agent installation.

**Architecture:** A dependency-light TypeScript executable validates configuration, adapts the installed Cursor CLI behind one internal boundary, runs it without a shell, and normalizes its NDJSON events into a stable envelope. Read-only analysis and direct-write execution share process infrastructure but keep separate task contracts and permissions.

**Tech Stack:** Node.js 22+, TypeScript 5, built-in `node:util` argument parsing, Vitest, npm package distribution, GitHub Actions.

## Global Constraints

- Repository, npm package, and executable name: `cursor-coworker`.
- Public license: MIT.
- Runtime: Node.js 22 or newer.
- Runtime dependencies: zero unless a later reviewed task demonstrates a concrete need.
- Default model: `auto`; documented initial model choices: `auto` and `composer-2.5`.
- Default working directory: current directory.
- `analyze` is read-only; `run` writes directly to the caller-selected directory.
- Sandbox is enabled for writes unless explicitly disabled.
- Delegation-command stdout contains only the stable JSON envelope; diagnostics go to stderr.
- Raw transcript retention is disabled by default.
- No branch, commit, patch, worktree, locking, queueing, telemetry, daemon, MCP, or CodeGraph-specific behavior.
- Standard tests make no authenticated or billable Cursor calls.
- The public README must state that the project is independent and not affiliated with or endorsed by Cursor.

---

## Planned file structure

```text
src/
  cli.ts                    executable entry point and command routing
  config.ts                 configuration parsing and precedence
  types.ts                  stable public and internal data contracts
  cursor/adapter.ts         Cursor command discovery and argv construction
  cursor/doctor.ts          local installation/auth/model diagnostics
  execution/process.ts      shell-free NDJSON process execution
  execution/normalize.ts    Cursor event to public envelope conversion
  tasks/contracts.ts        analyze/run prompt and permission contracts
  workspace/observer.ts     read-only Git before/after observations
  commands/delegate.ts      analyze/run orchestration
  commands/instructions.ts  generated CLAUDE.md and AGENTS.md guidance
test/
  fixtures/fake-cursor.mjs  controllable non-billable Cursor stand-in
  *.test.ts                 tests colocated by public responsibility
bench/
  cases.json                publishable benchmark task manifest
  score.ts                  deterministic result-record validation
.github/workflows/ci.yml    credential-free checks
docs/benchmark.md           reproducible benchmark protocol
README.md                   installation, safety, limitations, examples
LICENSE                     MIT license
```

### Task 1: Establish the package and stable contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/types.ts`
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `ModelId`, `DelegateMode`, `ResolvedConfig`, `ResultEnvelope`, `resolveConfig()`.
- Consumes: no earlier task interfaces.

- [ ] **Step 1: Add the package configuration and failing config tests**

Create `package.json`:

```json
{
  "name": "cursor-coworker",
  "version": "0.0.0",
  "description": "Delegate bounded coding work to an authenticated Cursor Agent CLI",
  "type": "module",
  "bin": { "cursor-coworker": "dist/cli.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "npm run build && npm test"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  },
  "license": "MIT"
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "bench/**/*.ts"],
  "exclude": ["test", "dist", "node_modules"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", coverage: { reporter: ["text"] } } });
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.cursor-coworker/
*.log
```

Create `test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("uses safe defaults", () => {
    expect(resolveConfig({}, {}, "/repo")).toMatchObject({
      cwd: "/repo",
      model: "auto",
      sandbox: true,
      retainTranscript: false,
      timeoutMs: 300_000
    });
  });

  it("applies CLI values over environment values", () => {
    const env = { CURSOR_COWORKER_MODEL: "composer-2.5", CURSOR_COWORKER_TIMEOUT_MS: "9000" };
    const cli = { model: "auto", timeoutMs: 1000, sandbox: false, retainTranscript: true };
    expect(resolveConfig(cli, env, "/repo")).toMatchObject({
      model: "auto", timeoutMs: 1000, sandbox: false, retainTranscript: true
    });
  });

  it("rejects invalid positive integers", () => {
    expect(() => resolveConfig({}, { CURSOR_COWORKER_TIMEOUT_MS: "zero" }, "/repo"))
      .toThrow("CURSOR_COWORKER_TIMEOUT_MS must be a positive integer");
  });
});
```

- [ ] **Step 2: Install dependencies and verify the tests fail**

Run: `rtk npm install`

Expected: dependencies install and `package-lock.json` is created.

Run: `rtk npm test -- test/config.test.ts`

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement the public types and configuration resolver**

Create `src/types.ts`:

```ts
export type ModelId = "auto" | "composer-2.5" | (string & {});
export type DelegateMode = "analyze" | "run";
export type CompletionState = "completed" | "incomplete" | "failed" | "interrupted";

export interface ResolvedConfig {
  cwd: string;
  model: ModelId;
  sandbox: boolean;
  retainTranscript: boolean;
  timeoutMs: number;
  cursorExecutable: string;
}

export interface EvidenceItem {
  kind: "file" | "symbol" | "command" | "test" | "other";
  value: string;
  detail?: string;
}

export interface ResultEnvelope {
  schemaVersion: 1;
  status: { technical: CompletionState; task: CompletionState };
  summary: string;
  evidence: EvidenceItem[];
  changes: { available: boolean; before?: string; after?: string };
  execution: {
    mode: DelegateMode;
    requestedModel: string;
    durationMs: number;
    exitCode: number | null;
    sessionId?: string;
    requestId?: string;
  };
  usage: { state: "observed" | "unknown"; inputTokens?: number; outputTokens?: number };
  warnings: string[];
}
```

Create `src/config.ts`:

```ts
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
```

- [ ] **Step 4: Run config tests and type checking**

Run: `rtk npm test -- test/config.test.ts`

Expected: 3 tests PASS.

Run: `rtk npm run build`

Expected: PASS with generated `dist/src/types.js` and `dist/src/config.js`.

- [ ] **Step 5: Commit the package foundation**

```bash
rtk git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/types.ts src/config.ts test/config.test.ts
rtk git commit -m "chore: establish cursor coworker package contracts"
```

### Task 2: Adapt and diagnose the installed Cursor CLI

**Files:**
- Create: `src/cursor/adapter.ts`
- Create: `src/cursor/doctor.ts`
- Test: `test/cursor-adapter.test.ts`
- Test: `test/doctor.test.ts`

**Interfaces:**
- Consumes: `ResolvedConfig`, `DelegateMode` from `src/types.ts`.
- Produces: `buildCursorArgs(mode, task, config): string[]`, `runDoctor(config, exec): Promise<DoctorReport>`.

- [ ] **Step 1: Write failing adapter and doctor tests**

Create `test/cursor-adapter.test.ts`:

```ts
import { expect, it } from "vitest";
import { buildCursorArgs } from "../src/cursor/adapter.js";

const config = {
  cwd: "/repo", model: "auto", sandbox: true, retainTranscript: false,
  timeoutMs: 1000, cursorExecutable: "cursor-agent"
};

it("builds a read-only analyze invocation", () => {
  expect(buildCursorArgs("analyze", "trace auth", config)).toEqual([
    "--print", "--output-format", "stream-json", "--mode", "ask",
    "--model", "auto", "--workspace", "/repo", "--trust", "trace auth"
  ]);
});

it("builds a sandboxed direct-write invocation", () => {
  expect(buildCursorArgs("run", "fix auth", config)).toEqual([
    "--print", "--output-format", "stream-json", "--force", "--sandbox", "enabled",
    "--model", "auto", "--workspace", "/repo", "--trust", "fix auth"
  ]);
});
```

Create `test/doctor.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { runDoctor } from "../src/cursor/doctor.js";

const config = {
  cwd: "/repo", model: "auto", sandbox: true, retainTranscript: false,
  timeoutMs: 1000, cursorExecutable: "cursor-agent"
};

it("reports version, authentication, and model availability", async () => {
  const exec = vi.fn()
    .mockResolvedValueOnce({ code: 0, stdout: "2026.06.16", stderr: "" })
    .mockResolvedValueOnce({ code: 0, stdout: '{"isAuthenticated":true}', stderr: "" })
    .mockResolvedValueOnce({ code: 0, stdout: "auto - Auto\\ncomposer-2.5 - Composer", stderr: "" });
  await expect(runDoctor(config, exec)).resolves.toMatchObject({
    ok: true, version: "2026.06.16", authenticated: true, modelAvailable: true
  });
});
```

- [ ] **Step 2: Verify both tests fail**

Run: `rtk npm test -- test/cursor-adapter.test.ts test/doctor.test.ts`

Expected: FAIL because the Cursor modules do not exist.

- [ ] **Step 3: Implement argument construction**

Create `src/cursor/adapter.ts`:

```ts
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
```

- [ ] **Step 4: Implement non-sensitive diagnostics**

Create `src/cursor/doctor.ts`:

```ts
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
```

- [ ] **Step 5: Run tests, build, and commit**

Run: `rtk npm test -- test/cursor-adapter.test.ts test/doctor.test.ts`

Expected: 3 tests PASS.

Run: `rtk npm run build`

Expected: PASS.

```bash
rtk git add src/cursor test/cursor-adapter.test.ts test/doctor.test.ts
rtk git commit -m "feat: detect and configure cursor agent"
```

### Task 3: Run Cursor safely with streaming, timeout, and cancellation

**Files:**
- Create: `src/execution/process.ts`
- Create: `test/fixtures/fake-cursor.mjs`
- Test: `test/process.test.ts`

**Interfaces:**
- Consumes: executable and argv supplied by `cursor-adapter`.
- Produces: `runProcess(request): Promise<ProcessResult>` and parsed `CursorEvent[]`.

- [ ] **Step 1: Create the fake executable and failing process tests**

Create `test/fixtures/fake-cursor.mjs`:

```js
#!/usr/bin/env node
const scenario = process.env.FAKE_CURSOR_SCENARIO ?? "success";
if (scenario === "hang") setInterval(() => {}, 1000);
else if (scenario === "malformed") { process.stdout.write("not-json\n"); }
else if (scenario === "failure") { process.stderr.write("blocked by policy\n"); process.exitCode = 7; }
else {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "session-1" }) + "\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: "done", duration_ms: 12, session_id: "session-1", request_id: "request-1" }) + "\n");
}
```

Create `test/process.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runProcess } from "../src/execution/process.js";

const executable = process.execPath;
const fixture = fileURLToPath(new URL("./fixtures/fake-cursor.mjs", import.meta.url));

it("parses NDJSON and returns the terminal event", async () => {
  const result = await runProcess({ executable, args: [fixture], timeoutMs: 1000, env: {} });
  expect(result).toMatchObject({ exitCode: 0, terminal: { type: "result", result: "done" } });
});

it("rejects malformed NDJSON", async () => {
  await expect(runProcess({ executable, args: [fixture], timeoutMs: 1000, env: { FAKE_CURSOR_SCENARIO: "malformed" } }))
    .rejects.toThrow("Cursor emitted invalid NDJSON");
});

it("terminates a timed-out process", async () => {
  await expect(runProcess({ executable, args: [fixture], timeoutMs: 30, env: { FAKE_CURSOR_SCENARIO: "hang" } }))
    .rejects.toThrow("Cursor execution timed out after 30ms");
});
```

- [ ] **Step 2: Verify process tests fail**

Run: `rtk npm test -- test/process.test.ts`

Expected: FAIL because `runProcess` does not exist.

- [ ] **Step 3: Implement shell-free NDJSON execution**

Create `src/execution/process.ts`:

```ts
import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";

export type CursorEvent = Record<string, unknown> & { type?: string; subtype?: string };

export interface ProcessRequest {
  executable: string;
  args: string[];
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  transcriptPath?: string;
}

export interface ProcessResult {
  exitCode: number | null;
  stderr: string;
  events: CursorEvent[];
  terminal?: CursorEvent;
}

export function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...request.env }
    });
    const events: CursorEvent[] = [];
    let stderr = "";
    let buffer = "";
    let settled = false;
    let transcript: WriteStream | undefined;
    if (request.transcriptPath) transcript = createWriteStream(request.transcriptPath, { mode: 0o600 });

    const stop = (message: string) => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 1000);
      force.unref();
      transcript?.end();
      reject(new Error(message));
    };

    const timer = setTimeout(() => stop(`Cursor execution timed out after ${request.timeoutMs}ms`), request.timeoutMs);
    request.signal?.addEventListener("abort", () => stop("Cursor execution interrupted"), { once: true });

    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      transcript?.write(text);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { events.push(JSON.parse(line) as CursorEvent); }
        catch { stop("Cursor emitted invalid NDJSON"); return; }
      }
    });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", error => { clearTimeout(timer); if (!settled) reject(error); });
    child.once("close", exitCode => {
      clearTimeout(timer);
      transcript?.end();
      if (settled) return;
      settled = true;
      if (buffer.trim()) {
        try { events.push(JSON.parse(buffer) as CursorEvent); }
        catch { reject(new Error("Cursor emitted invalid NDJSON")); return; }
      }
      const terminal = [...events].reverse().find(event => event.type === "result");
      resolve({ exitCode, stderr, events, ...(terminal ? { terminal } : {}) });
    });
  });
}
```

- [ ] **Step 4: Add explicit abort coverage**

Append to `test/process.test.ts`:

```ts
it("propagates caller cancellation", async () => {
  const controller = new AbortController();
  const pending = runProcess({
    executable, args: [fixture], timeoutMs: 1000,
    env: { FAKE_CURSOR_SCENARIO: "hang" }, signal: controller.signal
  });
  controller.abort();
  await expect(pending).rejects.toThrow("Cursor execution interrupted");
});
```

- [ ] **Step 5: Run tests, build, and commit**

Run: `rtk npm test -- test/process.test.ts`

Expected: 4 tests PASS and no fake process remains running.

Run: `rtk npm run build`

Expected: PASS.

```bash
rtk git add src/execution/process.ts test/process.test.ts test/fixtures/fake-cursor.mjs
rtk git commit -m "feat: run cursor with bounded structured streaming"
```

### Task 4: Define compact task contracts and normalize results

**Files:**
- Create: `src/tasks/contracts.ts`
- Create: `src/execution/normalize.ts`
- Test: `test/contracts.test.ts`
- Test: `test/normalize.test.ts`

**Interfaces:**
- Consumes: `DelegateMode`, `ResultEnvelope`, `CursorEvent`, `ProcessResult`.
- Produces: `buildTaskPrompt(mode, task): string`, `normalizeResult(input): ResultEnvelope`.

- [ ] **Step 1: Write failing contract and normalization tests**

Create `test/contracts.test.ts`:

```ts
import { expect, it } from "vitest";
import { buildTaskPrompt } from "../src/tasks/contracts.js";

it("forbids writes in analysis and requests evidence", () => {
  const prompt = buildTaskPrompt("analyze", "trace authentication");
  expect(prompt).toContain("Do not modify files or run commands that change state");
  expect(prompt).toContain("EVIDENCE_JSON");
  expect(prompt).toContain("trace authentication");
});

it("requires verification reporting for writes", () => {
  expect(buildTaskPrompt("run", "fix authentication")).toContain("Report verification commands and outcomes");
});
```

Create `test/normalize.test.ts`:

```ts
import { expect, it } from "vitest";
import { normalizeResult } from "../src/execution/normalize.js";

it("normalizes a successful terminal event", () => {
  const result = normalizeResult({
    mode: "analyze", requestedModel: "auto", exitCode: 0, stderr: "", before: undefined, after: undefined,
    terminal: {
      type: "result", subtype: "success", duration_ms: 12, session_id: "s", request_id: "r",
      result: 'Summary text\nEVIDENCE_JSON:[{"kind":"file","value":"src/auth.ts"}]'
    }
  });
  expect(result).toMatchObject({
    schemaVersion: 1,
    status: { technical: "completed", task: "completed" },
    summary: "Summary text",
    evidence: [{ kind: "file", value: "src/auth.ts" }]
  });
});

it("refuses to normalize a non-zero or terminal-less execution", () => {
  expect(() => normalizeResult({ mode: "analyze", requestedModel: "auto", exitCode: 1, stderr: "denied" }))
    .toThrow("Cursor failed with exit code 1: denied");
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `rtk npm test -- test/contracts.test.ts test/normalize.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement bounded prompts**

Create `src/tasks/contracts.ts`:

```ts
import type { DelegateMode } from "../types.js";

const outputContract = `Return a compact final answer. End with exactly one line beginning EVIDENCE_JSON: followed by a JSON array. Each item has kind (file, symbol, command, test, or other), value, and optional detail. Cite only evidence you actually inspected.`;

export function buildTaskPrompt(mode: DelegateMode, task: string): string {
  const permission = mode === "analyze"
    ? "Do not modify files or run commands that change state."
    : "Modify the requested files directly. Report verification commands and outcomes. Do not create branches, commits, patches, or worktrees.";
  return `${permission}\n${outputContract}\n\nTASK:\n${task}`;
}
```

- [ ] **Step 4: Implement strict normalization**

Create `src/execution/normalize.ts`:

```ts
import type { CursorEvent } from "./process.js";
import type { DelegateMode, EvidenceItem, ResultEnvelope } from "../types.js";

export interface NormalizeInput {
  mode: DelegateMode;
  requestedModel: string;
  exitCode: number | null;
  stderr: string;
  terminal?: CursorEvent;
  before?: string;
  after?: string;
  warnings?: string[];
}

function parseEvidence(text: string): { summary: string; evidence: EvidenceItem[]; warning?: string } {
  const marker = "\nEVIDENCE_JSON:";
  const index = text.lastIndexOf(marker);
  if (index < 0) return { summary: text.trim(), evidence: [], warning: "Cursor result omitted structured evidence" };
  const summary = text.slice(0, index).trim();
  try {
    const value = JSON.parse(text.slice(index + marker.length)) as unknown;
    if (!Array.isArray(value)) throw new Error("not an array");
    const evidence = value.filter((item): item is EvidenceItem =>
      typeof item === "object" && item !== null && typeof (item as EvidenceItem).kind === "string" && typeof (item as EvidenceItem).value === "string"
    );
    return { summary, evidence };
  } catch {
    return { summary, evidence: [], warning: "Cursor result contained invalid structured evidence" };
  }
}

export function normalizeResult(input: NormalizeInput): ResultEnvelope {
  if (input.exitCode !== 0 || !input.terminal || input.terminal.subtype !== "success") {
    throw new Error(`Cursor failed with exit code ${input.exitCode}: ${input.stderr.trim() || "missing terminal success event"}`);
  }
  const parsed = parseEvidence(String(input.terminal.result ?? ""));
  const warnings = [...(input.warnings ?? []), ...(parsed.warning ? [parsed.warning] : [])];
  return {
    schemaVersion: 1,
    status: { technical: "completed", task: parsed.summary ? "completed" : "incomplete" },
    summary: parsed.summary,
    evidence: parsed.evidence,
    changes: {
      available: input.before !== undefined && input.after !== undefined,
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {})
    },
    execution: {
      mode: input.mode,
      requestedModel: input.requestedModel,
      durationMs: Number(input.terminal.duration_ms ?? 0),
      exitCode: input.exitCode,
      ...(typeof input.terminal.session_id === "string" ? { sessionId: input.terminal.session_id } : {}),
      ...(typeof input.terminal.request_id === "string" ? { requestId: input.terminal.request_id } : {})
    },
    usage: { state: "unknown" },
    warnings
  };
}
```

- [ ] **Step 5: Run tests, build, and commit**

Run: `rtk npm test -- test/contracts.test.ts test/normalize.test.ts`

Expected: 4 tests PASS.

Run: `rtk npm run build`

Expected: PASS.

```bash
rtk git add src/tasks src/execution/normalize.ts test/contracts.test.ts test/normalize.test.ts
rtk git commit -m "feat: define compact delegation result contract"
```

### Task 5: Observe workspaces without managing Git

**Files:**
- Create: `src/workspace/observer.ts`
- Test: `test/workspace-observer.test.ts`

**Interfaces:**
- Produces: `observeWorkspace(cwd, exec): Promise<WorkspaceSnapshot | undefined>`.
- Consumes: no Cursor interface; uses injected shell-free Git execution.

- [ ] **Step 1: Write failing observer tests**

Create `test/workspace-observer.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { observeWorkspace } from "../src/workspace/observer.js";

it("captures porcelain status without changing the repository", async () => {
  const exec = vi.fn().mockResolvedValue({ code: 0, stdout: " M src/a.ts\n", stderr: "" });
  await expect(observeWorkspace("/repo", exec)).resolves.toEqual({ status: " M src/a.ts" });
  expect(exec).toHaveBeenCalledWith("git", ["-C", "/repo", "status", "--porcelain=v1", "--untracked-files=all"]);
});

it("returns undefined outside Git", async () => {
  const exec = vi.fn().mockResolvedValue({ code: 128, stdout: "", stderr: "not a repository" });
  await expect(observeWorkspace("/tmp", exec)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Verify observer tests fail**

Run: `rtk npm test -- test/workspace-observer.test.ts`

Expected: FAIL because the observer does not exist.

- [ ] **Step 3: Implement read-only observation**

Create `src/workspace/observer.ts`:

```ts
import { execCapture, type Exec } from "../cursor/doctor.js";

export interface WorkspaceSnapshot { status: string }

export async function observeWorkspace(
  cwd: string,
  exec: Exec = execCapture
): Promise<WorkspaceSnapshot | undefined> {
  const result = await exec("git", ["-C", cwd, "status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.code !== 0) return undefined;
  return { status: result.stdout.trim() };
}
```

- [ ] **Step 4: Run tests, build, and commit**

Run: `rtk npm test -- test/workspace-observer.test.ts`

Expected: 2 tests PASS.

Run: `rtk npm run build`

Expected: PASS.

```bash
rtk git add src/workspace/observer.ts test/workspace-observer.test.ts
rtk git commit -m "feat: observe workspace changes without git orchestration"
```

### Task 6: Orchestrate delegation and expose the CLI

**Files:**
- Create: `src/commands/delegate.ts`
- Create: `src/commands/instructions.ts`
- Create: `src/cli.ts`
- Test: `test/delegate.test.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: all previous task interfaces.
- Produces: `delegate(request, deps): Promise<ResultEnvelope>`, `main(argv, io): Promise<number>`.

- [ ] **Step 1: Write failing delegation test**

Create `test/delegate.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { delegate } from "../src/commands/delegate.js";

it("observes writes before and after and returns one envelope", async () => {
  const run = vi.fn().mockResolvedValue({
    exitCode: 0, stderr: "", events: [],
    terminal: { type: "result", subtype: "success", result: "done\nEVIDENCE_JSON:[]", duration_ms: 2 }
  });
  const observe = vi.fn().mockResolvedValueOnce({ status: "" }).mockResolvedValueOnce({ status: " M src/a.ts" });
  const result = await delegate({ mode: "run", task: "change a", cli: {}, env: {}, processCwd: "/repo" }, { run, observe });
  expect(result.changes).toEqual({ available: true, before: "", after: " M src/a.ts" });
});
```

- [ ] **Step 2: Write failing CLI output tests**

Create `test/cli.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

it("prints generated Claude instructions", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const code = await main(["instructions", "claude"], { stdout, stderr });
  expect(code).toBe(0);
  expect(stdout.mock.calls[0]?.[0]).toContain("cursor-coworker analyze");
  expect(stderr).not.toHaveBeenCalled();
});

it("returns usage error without a task", async () => {
  const stdout = vi.fn();
  const stderr = vi.fn();
  expect(await main(["analyze"], { stdout, stderr })).toBe(2);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--task is required"));
});
```

- [ ] **Step 3: Verify command tests fail**

Run: `rtk npm test -- test/delegate.test.ts test/cli.test.ts`

Expected: FAIL because command modules do not exist.

- [ ] **Step 4: Implement delegation orchestration**

Create `src/commands/delegate.ts`:

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
```

- [ ] **Step 5: Implement generated host instructions**

Create `src/commands/instructions.ts`:

```ts
export type InstructionTarget = "claude" | "codex";

export function generateInstructions(target: InstructionTarget): string {
  const host = target === "claude" ? "Claude Code" : "Codex";
  return `## Cursor Coworker\n\nWhen ${host} faces context-heavy repository reading, it may delegate with \`cursor-coworker analyze --task "<bounded question>" --cwd "$PWD"\`. Use \`cursor-coworker run\` only when the user or current workflow has authorized direct file changes. Consume the compact JSON result; do not request the raw Cursor transcript. The current workflow remains responsible for Git isolation, concurrency, verification, and review.`;
}
```

- [ ] **Step 6: Implement CLI parsing and clean stdout/stderr behavior**

Create `src/cli.ts`:

```ts
#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { delegate } from "./commands/delegate.js";
import { generateInstructions } from "./commands/instructions.js";
import { resolveConfig } from "./config.js";
import { runDoctor } from "./cursor/doctor.js";

export interface Io { stdout(text: string): void; stderr(text: string): void }
const defaultIo: Io = { stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text) };

export async function main(argv = process.argv.slice(2), io: Io = defaultIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "instructions") {
    const target = rest[0];
    if (target !== "claude" && target !== "codex") { io.stderr("target must be claude or codex\n"); return 2; }
    io.stdout(`${generateInstructions(target)}\n`);
    return 0;
  }
  const parsed = parseArgs({
    args: rest,
    options: {
      task: { type: "string" }, cwd: { type: "string" }, model: { type: "string" },
      timeout: { type: "string" }, "no-sandbox": { type: "boolean" },
      "retain-transcript": { type: "boolean" },
      "cursor-path": { type: "string" }
    },
    strict: true
  });
  const cli = {
    ...(parsed.values.cwd ? { cwd: parsed.values.cwd } : {}),
    ...(parsed.values.model ? { model: parsed.values.model } : {}),
    ...(parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {}),
    ...(parsed.values["no-sandbox"] ? { sandbox: false } : {}),
    ...(parsed.values["retain-transcript"] ? { retainTranscript: true } : {}),
    ...(parsed.values["cursor-path"] ? { cursorExecutable: parsed.values["cursor-path"] } : {})
  };
  try {
    if (command === "doctor") {
      const report = await runDoctor(resolveConfig(cli));
      io.stdout(`${JSON.stringify(report)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command !== "analyze" && command !== "run") { io.stderr("command must be analyze, run, doctor, or instructions\n"); return 2; }
    if (!parsed.values.task) { io.stderr("--task is required\n"); return 2; }
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    const result = await delegate({ mode: command, task: parsed.values.task, cli, signal: controller.signal });
    io.stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
```

- [ ] **Step 7: Run command tests and full checks**

Run: `rtk npm test -- test/delegate.test.ts test/cli.test.ts`

Expected: 3 tests PASS.

Run: `rtk npm run check`

Expected: build passes and all tests pass.

- [ ] **Step 8: Commit the working CLI**

```bash
rtk git add src/commands src/cli.ts test/delegate.test.ts test/cli.test.ts
rtk git commit -m "feat: expose analyze run doctor and instructions commands"
```

### Task 7: Make the repository public-ready

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`
- Create: `AGENTS.md`
- Modify: `package.json`
- Test: `test/package.test.ts`

**Interfaces:**
- Consumes: final CLI commands and JSON contract.
- Produces: documented installation, security model, contribution entry points, and credential-free CI.

- [ ] **Step 1: Write failing package metadata tests**

Create `test/package.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("publishes only the built CLI and public documents", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  expect(pkg.bin).toEqual({ "cursor-coworker": "dist/src/cli.js" });
  expect(pkg.files).toEqual(["dist/src", "README.md", "LICENSE"]);
  expect(pkg.repository?.url).toContain("cursor-coworker");
});

it("contains the independence disclaimer", async () => {
  const readme = await readFile("README.md", "utf8");
  expect(readme).toContain("not affiliated with or endorsed by Cursor");
});
```

- [ ] **Step 2: Verify metadata tests fail**

Run: `rtk npm test -- test/package.test.ts`

Expected: FAIL because public documents and final metadata do not exist.

- [ ] **Step 3: Correct publish metadata**

Modify the relevant `package.json` fields to:

```json
{
  "bin": { "cursor-coworker": "dist/src/cli.js" },
  "files": ["dist/src", "README.md", "LICENSE"],
  "repository": { "type": "git", "url": "git+https://github.com/RemyLespagnol/cursor-coworker.git" },
  "bugs": { "url": "https://github.com/RemyLespagnol/cursor-coworker/issues" },
  "homepage": "https://github.com/RemyLespagnol/cursor-coworker#readme"
}
```

- [ ] **Step 4: Add concise public documentation**

Create `README.md` with these exact top-level sections and content requirements:

```markdown
# Cursor Coworker

Delegate bounded repository analysis or implementation to an authenticated Cursor Agent CLI and return a compact machine-readable result.

> Cursor Coworker is an independent community project and is not affiliated with or endorsed by Cursor.

## Why

Preserve the primary coding agent's context by moving context-heavy reading to an existing Cursor seat. Usage remains metered by Cursor; this project does not promise free or cheaper execution.

## Requirements

- Node.js 22+
- A current `cursor-agent` installation
- An authenticated Cursor account with headless use permitted by its policy

## Quick start

```bash
npx cursor-coworker doctor
npx cursor-coworker analyze --task "Explain the authentication flow with file evidence" --cwd "$PWD"
```

## Commands

`doctor` checks the local Cursor installation, login, and selected model. `analyze` performs read-only exploration. `run` writes directly to the selected directory. `instructions claude|codex` prints host guidance.

Both delegation commands accept `--cwd`, `--model`, `--timeout`, `--no-sandbox`, `--retain-transcript`, and `--cursor-path`. Use `--no-sandbox` only when the task cannot run inside Cursor's normal sandbox.

## Safety model

`analyze` is read-only. `run` writes directly to the selected directory. The caller owns Git isolation, concurrency, backups, verification, and review. Cursor Teams may have on-demand usage enabled. Raw transcript retention is opt-in and Cursor may separately retain its own session data.

## Output

```json
{"schemaVersion":1,"status":{"technical":"completed","task":"completed"},"summary":"Authentication enters through src/auth.ts.","evidence":[{"kind":"file","value":"src/auth.ts"}],"changes":{"available":false},"execution":{"mode":"analyze","requestedModel":"auto","durationMs":1200,"exitCode":0},"usage":{"state":"unknown"},"warnings":[]}
```

`status` separates process completion from task completion. `summary` and `evidence` are compact model output. `changes` reports Git observations. `execution` contains deterministic run metadata. `usage` is explicit when unavailable. `warnings` exposes safety caveats.

## Models and usage

`auto` is the default. `composer-2.5` is the only initial comparison model. Consult the current Cursor dashboard, plan documentation, and company policy for authoritative usage information.

## Host-agent instructions

```bash
cursor-coworker instructions claude
cursor-coworker instructions codex
```

The generated guidance is additive. It does not modify or replace Superpowers or the host's native subagents.

## Development

```bash
npm install
npm run check
```

Standard tests use a fake executable and make no billable Cursor calls.

## License

MIT
```

- [ ] **Step 5: Add license, agent navigation, and CI**

Create `LICENSE`:

```text
MIT License

Copyright (c) 2026 Cursor Coworker contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Create `AGENTS.md`:

```markdown
# Repository guidance

- Start with `docs/superpowers/specs/2026-07-10-cursor-delegation-cli-design.md` for product decisions.
- Public contracts live in `src/types.ts`; Cursor-specific schema handling stays under `src/cursor/` and `src/execution/`.
- Use TDD and run `npm run check` before claiming completion.
- Standard tests must never call a real authenticated Cursor account.
- Keep stdout machine-readable and send diagnostics to stderr.
- Do not add orchestration, Git management, telemetry, or model-specific behavior outside the approved scope.
```

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 6: Verify the package without publishing**

Run: `rtk npm test -- test/package.test.ts`

Expected: 2 tests PASS.

Run: `rtk npm run check`

Expected: all build and test checks PASS.

Run: `rtk npm pack --dry-run`

Expected: package contains built files, README, and LICENSE; it excludes tests, transcripts, source maps outside `dist`, and local credentials.

- [ ] **Step 7: Commit the public repository surface**

```bash
rtk git add package.json package-lock.json README.md LICENSE AGENTS.md .github/workflows/ci.yml test/package.test.ts
rtk git commit -m "docs: prepare cursor coworker for public development"
```

### Task 8: Add a reproducible benchmark harness

**Files:**
- Create: `bench/cases.json`
- Create: `bench/score.ts`
- Create: `docs/benchmark.md`
- Modify: `package.json`
- Test: `test/benchmark-score.test.ts`

**Interfaces:**
- Consumes: saved JSON envelopes produced externally by primary-only, native-subagent, Auto, and Composer runs.
- Produces: `validateBenchmarkRecord()` and a credential-free scoring command.

- [ ] **Step 1: Write failing benchmark record tests**

Create `test/benchmark-score.test.ts`:

```ts
import { expect, it } from "vitest";
import { validateBenchmarkRecord } from "../bench/score.js";

it("accepts a complete scored run", () => {
  expect(validateBenchmarkRecord({
    caseId: "architecture-1", path: "cursor-auto", repetition: 1,
    primaryInputTokens: 1200, cursorUsageState: "unknown", latencyMs: 5000,
    factualScore: 4, evidenceScore: 4, reopenedSources: false, criticalError: false
  }).caseId).toBe("architecture-1");
});

it("rejects out-of-range blind scores", () => {
  expect(() => validateBenchmarkRecord({
    caseId: "x", path: "cursor-auto", repetition: 1, primaryInputTokens: 1,
    cursorUsageState: "unknown", latencyMs: 1, factualScore: 6,
    evidenceScore: 4, reopenedSources: false, criticalError: false
  })).toThrow("factualScore must be between 0 and 5");
});
```

- [ ] **Step 2: Verify benchmark tests fail**

Run: `rtk npm test -- test/benchmark-score.test.ts`

Expected: FAIL because `bench/score.ts` does not exist.

- [ ] **Step 3: Implement deterministic record validation**

Create `bench/score.ts`:

```ts
export type BenchmarkPath = "primary" | "native-subagent" | "cursor-auto" | "cursor-composer";

export interface BenchmarkRecord {
  caseId: string;
  path: BenchmarkPath;
  repetition: number;
  primaryInputTokens: number;
  cursorUsageState: "observed" | "dashboard-delta" | "unknown";
  cursorInputTokens?: number;
  cursorOutputTokens?: number;
  latencyMs: number;
  factualScore: number;
  evidenceScore: number;
  reopenedSources: boolean;
  criticalError: boolean;
}

function nonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
}

export function validateBenchmarkRecord(value: BenchmarkRecord): BenchmarkRecord {
  if (!value.caseId) throw new Error("caseId is required");
  if (!Number.isInteger(value.repetition) || value.repetition < 1) throw new Error("repetition must be a positive integer");
  nonNegative(value.primaryInputTokens, "primaryInputTokens");
  nonNegative(value.latencyMs, "latencyMs");
  for (const field of ["factualScore", "evidenceScore"] as const) {
    const score = value[field];
    if (!Number.isInteger(score) || score < 0 || score > 5) throw new Error(`${field} must be between 0 and 5`);
  }
  return value;
}

if (process.argv[1]?.endsWith("score.js")) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const records = JSON.parse(Buffer.concat(chunks).toString("utf8")) as BenchmarkRecord[];
  const valid = records.map(validateBenchmarkRecord);
  process.stdout.write(`${JSON.stringify({ records: valid.length, valid: true })}\n`);
}
```

- [ ] **Step 4: Add representative case definitions**

Create `bench/cases.json`:

```json
[
  { "id": "architecture-1", "category": "architecture", "task": "Explain the major module boundaries and cite the defining files." },
  { "id": "flow-1", "category": "multi-module-flow", "task": "Trace one request from entry point to persistence and cite each transition." },
  { "id": "comparison-1", "category": "comparison", "task": "Compare two implementations of the same responsibility and identify behavioral differences." },
  { "id": "regression-1", "category": "defect-analysis", "task": "Find the cause of a supplied failing test without changing files." },
  { "id": "implementation-1", "category": "bounded-write", "task": "Implement one specified change and run its focused verification." }
]
```

- [ ] **Step 5: Document the blind benchmark protocol**

Create `docs/benchmark.md` with these binding rules:

```markdown
# Benchmark protocol

## Paths

Run every case with the primary agent alone, a native subagent, Cursor Auto, and Cursor Composer 2.5. Use the same repository commit, task text, allowed tools, and time limit. Repeat each path at least three times.

## Isolation

Use public fixtures or approved private repositories. Never publish proprietary source, prompts containing secrets, raw transcripts, or company usage data.

## Measurements

Record primary-agent input tokens, Cursor usage state, latency, whether the primary agent reopened sources, and critical errors. If Cursor usage is inferred from a dashboard delta, run no other Cursor task during that measurement window and label it `dashboard-delta`.

## Blind scoring

Remove tool and model identifiers before a reviewer scores factual correctness and evidence quality from 0 to 5. The reviewer verifies citations against the fixed repository commit.

## Continuation gate

Continue only with at least 30% lower primary-agent context, at least 80% directly usable delegated results, no increase in critical errors, sufficiently predictable Cursor usage, and installation-to-first-result under five minutes.

## Interpretation

Report medians, ranges, failures, missing usage data, and repository limitations. Do not claim cost savings from token prices alone.
```

- [ ] **Step 6: Add and verify the benchmark command**

Add to `package.json` scripts:

```json
"benchmark:validate": "node dist/bench/score.js"
```

Run: `rtk npm test -- test/benchmark-score.test.ts`

Expected: 2 tests PASS.

Run: `rtk npm run check`

Expected: all build and test checks PASS.

Run: `rtk proxy sh -lc 'printf "%s" "[]" | node dist/bench/score.js'`

Expected stdout: `{"records":0,"valid":true}`.

- [ ] **Step 7: Commit the benchmark harness**

```bash
rtk git add bench docs/benchmark.md package.json package-lock.json test/benchmark-score.test.ts
rtk git commit -m "test: add reproducible delegation benchmark protocol"
```

## Final verification and release gate

- [ ] Run: `rtk npm run check`

Expected: TypeScript build passes and all credential-free tests pass.

- [ ] Run: `rtk npm pack --dry-run`

Expected: only intended public runtime and documentation files are packaged.

- [ ] Run opt-in local probes after explicit confirmation that Cursor usage is acceptable:

```bash
rtk proxy node dist/src/cli.js doctor
rtk proxy node dist/src/cli.js analyze --task "Return a one-sentence description of this repository with file evidence" --model auto
rtk proxy node dist/src/cli.js analyze --task "Return a one-sentence description of this repository with file evidence" --model composer-2.5
```

Expected: doctor succeeds; both analyses emit one `schemaVersion: 1` JSON line on stdout and no raw transcript file.

- [ ] Inspect `rtk git status --short` and `rtk git log --oneline`.

Expected: only intentional changes remain and every task has its own commit.

- [ ] Before any external publication, stop for explicit approval of:

```text
GitHub owner and visibility
README and trademark disclaimer
LICENSE copyright name
npm ownership and package availability re-check
final git diff and secret scan
```

No `gh repo create`, `git push`, `npm publish`, release, or external message is authorized by this implementation plan alone.
