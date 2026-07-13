#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { delegate } from "./commands/delegate.js";
import { installSkill } from "./commands/install-skill.js";
import { generateInstructions } from "./commands/instructions.js";
import { resolveConfig } from "./config.js";
import { runDoctor } from "./cursor/doctor.js";

export interface Io { stdout(text: string): void; stderr(text: string): void }
const defaultIo: Io = { stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text) };

export interface CliDeps {
  installSkill?: typeof installSkill;
}

export async function main(
  argv = process.argv.slice(2),
  io: Io = defaultIo,
  deps: CliDeps = {}
): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "instructions") {
    const target = rest[0];
    if (target !== "claude" && target !== "codex") { io.stderr("target must be claude or codex\n"); return 2; }
    io.stdout(`${generateInstructions(target)}\n`);
    return 0;
  }
  try {
    if (command === "install-skill") {
      const target = rest[0];
      if (target !== "codex" && target !== "claude") {
        throw new TypeError("target must be codex or claude");
      }
      const installArgs = parseArgs({
        args: rest.slice(1),
        options: {
          scope: { type: "string" },
          cwd: { type: "string" }
        },
        strict: true
      });
      const scope = installArgs.values.scope ?? "project";
      if (scope !== "project" && scope !== "user") {
        throw new TypeError("--scope must be project or user");
      }
      const result = (deps.installSkill ?? installSkill)({
        host: target,
        scope,
        ...(installArgs.values.cwd ? { cwd: installArgs.values.cwd } : {})
      });
      io.stdout(`${JSON.stringify(result)}\n`);
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
    if (command === "doctor") {
      const report = await runDoctor(resolveConfig(cli));
      io.stdout(`${JSON.stringify(report)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command !== "analyze" && command !== "run") {
      io.stderr("command must be analyze, run, doctor, instructions, or install-skill\n");
      return 2;
    }
    if (!parsed.values.task) { io.stderr("--task is required\n"); return 2; }
    const controller = new AbortController();
    const onInterrupt = () => controller.abort();
    process.once("SIGINT", onInterrupt);
    try {
      const result = await delegate({ mode: command, task: parsed.values.task, cli, signal: controller.signal });
      io.stdout(`${JSON.stringify(result)}\n`);
      return result.status.technical === "interrupted" ? 130 : result.status.technical === "failed" ? 1 : 0;
    } finally { process.removeListener("SIGINT", onInterrupt); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return error instanceof TypeError || message.includes("must be a positive integer") || message.includes("boolean environment value") ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) process.exitCode = await main();
