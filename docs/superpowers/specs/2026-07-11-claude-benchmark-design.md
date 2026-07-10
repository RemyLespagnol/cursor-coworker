# Claude Benchmark Design

## Goal

Extend the local read-only benchmark with two comparable Claude Code paths:

- Claude Sonnet without subagents.
- Claude Sonnet with subagent delegation enabled.

The benchmark must never modify the source `ms-ads` repository.

## Execution model

Each invocation creates a fresh disposable copy of the target repository at the commit recorded when the benchmark starts. Claude runs only inside that copy. The copy is removed after the result and workspace state have been recorded, whether the invocation succeeds or fails.

Claude Code is invoked non-interactively with:

- `--model sonnet`;
- `--dangerously-skip-permissions`;
- project-level instructions enabled;
- user-level settings and personal customizations excluded;
- structured JSON output and no session persistence.

The single-agent path disables Claude's agent delegation tool. The subagent path enables delegation and explicitly asks Claude to use subagents when useful. All agents use Sonnet so the comparison measures orchestration rather than a model mix.

## Benchmark matrix

Both Claude paths run the existing four read-only cases with three repetitions. Runs remain sequential. Each run receives the same task text and the same target commit as the Cursor benchmark.

The benchmark records:

- technical and task completion;
- elapsed time;
- input, cache-read, output, and total tokens when Claude exposes them;
- cost when exposed;
- cited evidence;
- whether the disposable repository changed;
- provider and execution-path metadata;
- raw structured output needed for later scoring.

One failed run is recorded and does not prevent later runs from executing. Setup failures that make every run invalid, such as a missing executable or authentication, fail before the matrix starts.

## Isolation and safety

YOLO mode is permitted only inside the disposable copy. The runner snapshots the real target before and after every invocation and fails immediately if its commit or worktree status changes. It creates no branch, commit, worktree, or output file in the target repository.

Benchmark outputs remain under `.benchmark-results/` in `cursor-coworker`. Temporary copies are outside the target and are removed on completion or error.

## Interface

The existing runner gains provider selection while preserving the current Cursor defaults. The intended invocation is:

```bash
npm run benchmark:run -- \
  --repo ../../ms-ads \
  --providers claude-sonnet,claude-sonnet-subagents
```

The Claude executable is configurable for tests and non-standard installations. Standard tests use a fake executable and never call an authenticated Claude account.

## Verification

Tests cover argument construction, disabled versus enabled delegation, one fresh disposable copy per run, cleanup after success and failure, result normalization, continued execution after a run failure, and detection of any real-target mutation. The full `npm run check` suite must pass before completion.
