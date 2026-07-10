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
  if (request.signal?.aborted) return Promise.reject(new Error("Cursor execution interrupted"));

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
    let stopReason: Error | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    let transcript: WriteStream | undefined;
    if (request.transcriptPath) transcript = createWriteStream(request.transcriptPath, { mode: 0o600 });

    const cleanup = () => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      request.signal?.removeEventListener("abort", onAbort);
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (transcript) transcript.end(action);
      else action();
    };
    const stop = (message: string) => {
      if (stopReason || settled) return;
      stopReason = new Error(message);
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      forceTimer.unref();
    };
    const onAbort = () => stop("Cursor execution interrupted");
    const timer = setTimeout(() => stop(`Cursor execution timed out after ${request.timeoutMs}ms`), request.timeoutMs);
    request.signal?.addEventListener("abort", onAbort, { once: true });

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
    child.once("error", error => settle(() => reject(error)));
    child.once("close", exitCode => {
      if (settled) return;
      if (stopReason) { settle(() => reject(stopReason)); return; }
      if (buffer.trim()) {
        try { events.push(JSON.parse(buffer) as CursorEvent); }
        catch { settle(() => reject(new Error("Cursor emitted invalid NDJSON"))); return; }
      }
      const terminal = [...events].reverse().find(event => event.type === "result");
      settle(() => resolve({ exitCode, stderr, events, ...(terminal ? { terminal } : {}) }));
    });
  });
}
