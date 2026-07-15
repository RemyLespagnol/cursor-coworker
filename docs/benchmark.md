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

## Comparison report

`benchmark:report` loads one or more existing result directories, attaches blind scores, optionally enriches Cursor runs from a private usage CSV, then writes a machine-readable comparison to stdout and optional files. It never re-invokes a model and never writes into the input result directories.

```bash
npm run benchmark:report -- \
  --results .benchmark-results/cursor-run \
  --results .benchmark-results/claude-run \
  --scores /private/path/blind-scores.json \
  --cursor-csv /private/path/team-usage-events.csv \
  --cursor-start 2026-07-10T22:10:00Z \
  --cursor-end 2026-07-10T23:00:00Z \
  --cursor-exclude-id cloud-agent-id-to-skip \
  --json .benchmark-results/comparison.json \
  --markdown .benchmark-results/comparison.md
```

Options:

```text
--results PATH          result directory (repeat for each provider; at least one required)
--scores PATH           blind-score JSON (required)
--cursor-csv PATH       Cursor usage-events CSV export
--cursor-start ISO      inclusive start of the attribution window (requires --cursor-csv)
--cursor-end ISO        exclusive end of the attribution window (requires --cursor-csv)
--cursor-exclude-id ID  Cloud Agent ID to exclude (repeat as needed; requires --cursor-csv)
--json PATH             write the comparison JSON to a file
--markdown PATH         write the comparison Markdown table to a file
```

### Score schema

Scoring stays manual and blind; the command validates and aggregates scores but never invents them. The `--scores` file uses this exact public shape:

```json
{
  "schemaVersion": 1,
  "scores": [
    {
      "provider": "cursor-auto",
      "caseId": "architecture",
      "repetition": 1,
      "factualScore": 5,
      "evidenceScore": 4,
      "usable": true,
      "criticalError": false
    }
  ]
}
```

`factualScore` and `evidenceScore` are integers from 0 through 5; `usable` and `criticalError` are booleans. Scorer identities are absent from the file. Blind the filenames and model labels before review, and give every input result directory a unique provider/case/repetition identity — duplicate run keys are rejected.

### Cursor usage attribution

Cursor event matching uses the explicit half-open `[start, end)` window and the exact chronological model sequence of the loaded Cursor runs. Auxiliary events sharing the window must be excluded by Cloud Agent ID with repeated `--cursor-exclude-id` flags. If the surviving event count or model order does not match the Cursor runs, the command fails rather than guessing.

Cursor list-price value is an estimate reported as `estimatedUsageValueUsd`; a `Cost` cell of `Included` maps to zero `additionalBilledCostUsd`, while a numeric cost is recorded as charged. Claude `total_cost_usd` is likewise recorded as `estimatedUsageValueUsd`, not assumed to be an invoice charge. Subagent token coverage can remain incomplete. The report JSON and Markdown contain only aggregates — never raw responses, user names, session IDs, or CSV rows.

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

## Opt-in Claude Code Agent Skill trigger experiment

`bench/cases.skill-trigger.json` contains ten prompts that should delegate and ten prompts that should remain local. This experiment invokes real Claude Code, so it is opt-in and excluded from `npm run check`.

The explored repository must be a disposable clone of the current Cursor Coworker checkout because the fixed cases are grounded in this repository. The fake executable, its log, and the trigger `bin` directory must all live **outside** the explored repository: if Claude Code can see `.trigger-bin` or the log inside the repo it explores, it recognizes the harness and declines to delegate.

Run Claude Code without hooks that paste a complete answer into every prompt. Partial indexed context is part of the experiment: CodeGraph may provide entry points while Cursor Coworker handles the remaining broad synthesis. A complete narrow answer should remain a negative case. Record which indexed context was present so positive and negative classifications remain reproducible.

The fixed indexed cases are self-contained and grounded in the cloned repository: each prompt names the real paths and symbols needed to reproduce its classification in a fresh session. Use the labels `partial indexed context` and `complete narrow answer` when recording these cases.

Test activation without a Cursor login or billable call:

1. Build the package and clone the current Cursor Coworker checkout at its exact HEAD into a disposable directory so the fixed cases remain grounded in the cloned repository.
2. Install the Claude skill in the clone, check that `.claude/CLAUDE.md` is absent, then write the generated `instructions claude` output there.
3. Create a temporary `bin` directory **outside** the explored repository, containing an executable named `cursor-coworker` that points to `bench/fake-cursor-coworker.mjs`.
4. Set `CURSOR_COWORKER_TRIGGER_LOG` to a private JSONL output path **outside** the explored repository.
5. Put the temporary `bin` first on `PATH`.
6. Submit every fixed prompt to Claude Code in a fresh session rooted in that clone. Include the fixed partial-index and complete-answer CodeGraph cases without pre-injecting unrelated repository content.
7. Count a case as delegated only when the log records exactly one `analyze` invocation for that case.
8. Fail the safety check if the log records any other command.

Example POSIX setup:

```bash
npm run build
# Clone the current Cursor Coworker checkout, which matches the fixed cases.
source="$(git rev-parse --show-toplevel)"
commit="$(git -C "$source" rev-parse HEAD)"
target="$(mktemp -d)/cursor-coworker"
git clone --no-local "$source" "$target"
git -C "$target" checkout --detach "$commit"
node dist/src/cli.js install-skill claude --cwd "$target"
mkdir -p "$target/.claude"
test ! -e "$target/.claude/CLAUDE.md"
node dist/src/cli.js instructions claude > "$target/.claude/CLAUDE.md"

# harness lives OUTSIDE the explored repo so the host cannot see it
harness="$(mktemp -d)"
mkdir -p "$harness/bin"
ln -s "$PWD/bench/fake-cursor-coworker.mjs" "$harness/bin/cursor-coworker"
export PATH="$harness/bin:$PATH"
export CURSOR_COWORKER_TRIGGER_LOG="$harness/calls.jsonl"
```

Redirecting into `.claude/CLAUDE.md` is safe here only because the clone is disposable and the command checks that the file is absent first. Normal users must review and manually merge the printed block into an existing `CLAUDE.md` as documented in the README.

Run the fixed prompts manually or through an independently reviewed Claude Code runner. Do not add Claude Code invocations to the standard suite. Record the Claude Code version, case ID, whether delegation was expected, whether it occurred, number of calls, command, and latency.

Continue when Claude Code reaches at least 80% correct delegation on positive cases, no more than 10% false-positive delegation on negative cases, and no write-capable invocation. After trigger behavior passes, repeat positive cases with the real CLI and measure whether at least 80% of successful results avoid repeated broad exploration.

If trigger thresholds fail, revise the skill description and examples once before reconsidering MCP. FastContext remains a separate future benchmark provider and is not installed by this workflow.
