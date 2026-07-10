#!/usr/bin/env node
const scenario = process.env.FAKE_CURSOR_SCENARIO ?? "success";
if (scenario === "hang") setInterval(() => {}, 1000);
else if (scenario === "malformed") { process.stdout.write("not-json\n"); }
else if (scenario === "failure") { process.stderr.write("blocked by policy\n"); process.exitCode = 7; }
else {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "session-1" }) + "\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: "done", duration_ms: 12, session_id: "session-1", request_id: "request-1" }) + "\n");
}
