import type { CursorUsageAttribution, LoadedBenchmarkRun, ObservedUsage } from "./report-types.js";

export interface CursorUsageOptions {
  startAt: string;
  endAt: string;
  excludedAgentIds: string[];
}

// Cursor list prices retrieved 2026-07-10: https://cursor.com/docs/account/pricing
export const CURSOR_PRICES_USD_PER_MILLION = {
  auto: { input: 1.25, cacheRead: 0.25, output: 6 },
  "composer-2.5": { input: 0.50, cacheRead: 0.20, output: 2.50 }
} as const;

type PricedModel = keyof typeof CURSOR_PRICES_USD_PER_MILLION;

const REQUIRED_HEADERS = [
  "Date", "Cloud Agent ID", "Model", "Input (w/o Cache Write)",
  "Cache Read", "Output Tokens", "Total Tokens", "Cost"
] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; started = true; continue; }
    if (char === ",") { record.push(field); field = ""; started = true; continue; }
    if (char === "\n") {
      if (field !== "" || record.length > 0 || started) { record.push(field); rows.push(record); }
      field = ""; record = []; started = false;
      continue;
    }
    if (char === "\r") continue;
    field += char;
    started = true;
  }
  if (quoted) throw new Error("unclosed quoted field in CSV");
  if (field !== "" || record.length > 0 || started) { record.push(field); rows.push(record); }
  return rows;
}

function integer(value: string, column: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error(`${column} must be a non-negative integer`);
  return Number.parseInt(trimmed, 10);
}

function normalizeModel(value: string): string {
  return value.trim().toLowerCase();
}

interface CursorEvent {
  date: number;
  model: string;
  agentId: string;
  inputNoCacheWrite: number;
  cacheRead: number;
  output: number;
  total: number;
  cost: string;
}

function billing(cost: string): Pick<ObservedUsage, "billingState" | "additionalBilledCostUsd"> {
  if (cost === "Included") return { billingState: "included", additionalBilledCostUsd: 0 };
  const numeric = cost.trim().replace(/^\$/, "");
  if (/^\d+(\.\d+)?$/.test(numeric)) return { billingState: "charged", additionalBilledCostUsd: Number.parseFloat(numeric) };
  return { billingState: "unknown" };
}

function eventUsage(event: CursorEvent): ObservedUsage {
  const price = CURSOR_PRICES_USD_PER_MILLION[event.model as PricedModel];
  const estimatedUsageValueUsd =
    (event.inputNoCacheWrite * price.input + event.cacheRead * price.cacheRead + event.output * price.output) / 1_000_000;
  return {
    state: "observed",
    inputTokens: event.inputNoCacheWrite,
    cacheReadTokens: event.cacheRead,
    outputTokens: event.output,
    totalTokens: event.total,
    estimatedUsageValueUsd,
    source: "cursor-csv",
    ...billing(event.cost)
  };
}

export function attributeCursorUsage(
  runs: LoadedBenchmarkRun[],
  csvText: string,
  options: CursorUsageOptions
): CursorUsageAttribution {
  const start = Date.parse(options.startAt);
  if (Number.isNaN(start)) throw new Error("Cursor start boundary is not a valid timestamp");
  const end = Date.parse(options.endAt);
  if (Number.isNaN(end)) throw new Error("Cursor end boundary is not a valid timestamp");
  if (end <= start) throw new Error("Cursor end boundary must be after the start boundary");

  const cursorRuns = runs.filter(run => !run.provider.startsWith("claude-"));
  const expectedModels = new Set(cursorRuns.map(run => normalizeModel(run.model)));
  const excluded = new Set(options.excludedAgentIds);

  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header) throw new Error("Cursor CSV is empty");
  const index = new Map(header.map((name, i) => [name, i]));
  for (const required of REQUIRED_HEADERS) {
    if (!index.has(required)) throw new Error(`Cursor CSV is missing required column: ${required}`);
  }
  const col = (name: string): number => index.get(name)!;

  const events: CursorEvent[] = [];
  for (const row of rows) {
    if (row.length !== header.length) throw new Error("Cursor CSV row has the wrong number of columns");
    const date = Date.parse(row[col("Date")]);
    if (Number.isNaN(date) || date < start || date >= end) continue;
    const agentId = row[col("Cloud Agent ID")];
    if (excluded.has(agentId)) continue;
    const model = normalizeModel(row[col("Model")]);
    if (!expectedModels.has(model)) continue;
    events.push({
      date, model, agentId,
      inputNoCacheWrite: integer(row[col("Input (w/o Cache Write)")], "Input (w/o Cache Write)"),
      cacheRead: integer(row[col("Cache Read")], "Cache Read"),
      output: integer(row[col("Output Tokens")], "Output Tokens"),
      total: integer(row[col("Total Tokens")], "Total Tokens"),
      cost: row[col("Cost")]
    });
  }

  events.sort((a, b) => a.date - b.date);
  if (events.length !== cursorRuns.length) {
    throw new Error(`Cursor event count ${events.length} does not match Cursor run count ${cursorRuns.length}`);
  }
  cursorRuns.forEach((run, i) => {
    if (normalizeModel(run.model) !== events[i].model) {
      throw new Error(`Cursor event model ${events[i].model} does not match run model ${run.model} at position ${i + 1}`);
    }
  });

  return { entries: cursorRuns.map((run, i) => ({ key: run.key, usage: eventUsage(events[i]) })) };
}

export function applyCursorUsage(runs: LoadedBenchmarkRun[], attribution: CursorUsageAttribution): LoadedBenchmarkRun[] {
  const byKey = new Map(attribution.entries.map(entry => [entry.key, entry.usage]));
  return runs.map(run => {
    const usage = byKey.get(run.key);
    return usage ? { ...run, usage } : run;
  });
}
