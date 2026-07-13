#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);
const log = process.env.CURSOR_COWORKER_TRIGGER_LOG;

if (!log) {
  process.stderr.write("CURSOR_COWORKER_TRIGGER_LOG is required\n");
  process.exitCode = 2;
} else {
  appendFileSync(log, `${JSON.stringify({ command: command ?? "", args })}\n`, { mode: 0o600 });
  if (command !== "analyze") {
    process.stderr.write("Fake Cursor Coworker is read-only and accepts only analyze\n");
    process.exitCode = 2;
  } else {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      status: { technical: "completed", task: "completed" },
      summary: "Recorded read-only delegation for trigger evaluation.",
      evidence: [{ kind: "other", value: "recording-fake" }],
      changes: { available: false },
      execution: {
        mode: "analyze",
        requestedModel: "fake",
        durationMs: 0,
        exitCode: 0
      },
      usage: { state: "unknown" },
      warnings: []
    })}\n`);
  }
}
