import type { BenchmarkComparison, ProviderSummary } from "./report-types.js";

const score = (value?: number): string => value === undefined ? "—" : `${value.toFixed(2)} / 5`;
const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;
const seconds = (value: number): string => `${(value / 1000).toFixed(1)} s`;
const usd = (value?: number): string => value === undefined ? "—" : `$${value.toFixed(2)}`;

function label(provider: string): string {
  return provider.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function row(provider: ProviderSummary): string {
  return `| ${label(provider.provider)} | ${score(provider.overallScore)} | ${provider.usableRuns}/${provider.runs} `
    + `| ${percent(provider.runs === 0 ? 0 : provider.taskSuccesses / provider.runs)} | ${seconds(provider.medianLatencyMs)} `
    + `| ${percent(provider.usageCoverage)} | ${usd(provider.estimatedUsageValueUsd)} | ${usd(provider.additionalBilledCostUsd)} |`;
}

export function renderMarkdown(comparison: BenchmarkComparison): string {
  const header = "| Provider | Quality | Usable | Task success | Median latency | Usage coverage | Estimated usage value | Additional billed cost |";
  const divider = "| --- | --- | --- | --- | --- | --- | --- | --- |";
  const lines = [
    "# Benchmark Comparison",
    "",
    `Generated at ${comparison.generatedAt}`,
    "",
    header,
    divider,
    ...comparison.providers.map(row),
    "",
    "## Limitations",
    "",
    ...comparison.limitations.map(item => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}
