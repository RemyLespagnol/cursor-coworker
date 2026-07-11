#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadBenchmarkRuns, loadBlindScores, attachScores } from "./report-load.js";
import { attributeCursorUsage, applyCursorUsage } from "./cursor-usage.js";
import { aggregateBenchmark } from "./report-aggregate.js";
import { renderMarkdown } from "./report-render.js";
import type { LoadedBenchmarkRun } from "./report-types.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        results: { type: "string", multiple: true },
        scores: { type: "string" },
        "cursor-csv": { type: "string" },
        "cursor-start": { type: "string" },
        "cursor-end": { type: "string" },
        "cursor-exclude-id": { type: "string", multiple: true },
        json: { type: "string" },
        markdown: { type: "string" }
      },
      strict: true
    });
    const values = parsed.values;

    const results = values.results ?? [];
    if (results.length === 0) throw new Error("--results is required at least once");
    if (!values.scores) throw new Error("--scores is required");

    const cursorCsv = values["cursor-csv"];
    const cursorStart = values["cursor-start"];
    const cursorEnd = values["cursor-end"];
    const cursorExclude = values["cursor-exclude-id"] ?? [];
    if (cursorCsv) {
      if (!cursorStart || !cursorEnd) throw new Error("--cursor-csv requires --cursor-start and --cursor-end");
    } else if (cursorStart || cursorEnd || cursorExclude.length > 0) {
      throw new Error("--cursor-start, --cursor-end, and --cursor-exclude-id require --cursor-csv");
    }

    let runs: LoadedBenchmarkRun[] = loadBenchmarkRuns(results);
    const scores = loadBlindScores(values.scores);
    attachScores(runs, scores);

    if (cursorCsv) {
      const attribution = attributeCursorUsage(runs, readFileSync(cursorCsv, "utf8"), {
        startAt: cursorStart!,
        endAt: cursorEnd!,
        excludedAgentIds: cursorExclude
      });
      runs = applyCursorUsage(runs, attribution);
    }

    const comparison = aggregateBenchmark(runs, scores);
    const markdown = renderMarkdown(comparison);

    if (values.json) writeReport(values.json, `${JSON.stringify(comparison, null, 2)}\n`);
    if (values.markdown) writeReport(values.markdown, markdown);

    process.stdout.write(`${JSON.stringify(comparison)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function writeReport(path: string, content: string): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, { mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
