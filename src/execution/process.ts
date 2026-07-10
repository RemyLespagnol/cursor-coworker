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
      clearTimeout(timer);
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
    child.once("error", reject);
    child.once("close", exitCode => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      transcript?.end();
      if (buffer.trim()) {
        try { events.push(JSON.parse(buffer) as CursorEvent); }
        catch { return reject(new Error("Cursor emitted invalid NDJSON")); }
      }
      const terminal = [...events].reverse().find(event => event.type === "result");
      resolve({ exitCode, stderr, events, ...(terminal ? { terminal } : {}) });
    });
  });
}
