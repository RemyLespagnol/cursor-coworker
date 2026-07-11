# Benchmark protocol

## Automated read-only run

The runner compares Cursor Auto and Composer 2.5 sequentially, with three repetitions of four generic analysis cases by default:

```bash
npm run benchmark:run -- --repo /absolute/or/relative/repository
```

Results are written under `.benchmark-results/<timestamp>/` in the current directory, never in the target repository. The target must be a clean Git worktree. The runner records its commit and checks after every call that neither the commit nor worktree status changed. It never creates branches, commits, or pushes.

Options:

```text
--cases PATH          JSON case file (default: bench/cases.readonly.json)
--models LIST         comma-separated models (default: auto,composer-2.5)
--repetitions NUMBER  repetitions per case and model (default: 3)
--output PATH         result directory (default: .benchmark-results/<timestamp>)
--timeout MS          timeout for each Cursor call
--cursor-path PATH    alternate cursor-agent executable
```

## Claude Sonnet comparison

Run the same cases with Claude Sonnet, first without subagents and then with native subagent delegation:

```bash
npm run benchmark:run -- \
  --repo /absolute/or/relative/repository \
  --providers claude-sonnet,claude-sonnet-subagents
```

Claude runs with `--model sonnet`, `--safe-mode`, and a strict read-only tool set, never inside the target repository. Every invocation gets a fresh disposable clone at the recorded target commit, with its origin remote removed. Project and user settings, hooks, and plugins are excluded. The single-agent variant receives `Read`, `Glob`, and `Grep`; the subagent variant additionally receives `Agent`. Temporary clones are removed after successful and failed calls.

Claude Code documents that subagents inherit the tools available in the parent conversation. The parent allowlist therefore limits spawned agents to the same read-only tools: <https://code.claude.com/docs/en/sub-agents#available-tools>.

Claude's JSON output supplies token and cost fields directly when available. The runner records input (including cache reads and writes), output, total tokens, cost, and whether Claude changed its disposable clone. Subagent token usage is marked `observed-incomplete` because Claude's parent result can omit delegated-agent tokens even when its cost is aggregated. Use `--claude-path PATH` for a non-standard executable and `--timeout MS` to bound each invocation.

Each case file is a non-empty JSON array of `{ "id", "category", "task" }` objects. All cases run through the read-only `analyze` command. The final `report.json` contains execution status, latency, evidence count, usage state, and the path to every raw result. Factual and evidence scoring remains a blind manual step.

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
