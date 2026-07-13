# Claude Skill Discoverability Design

## Status

Approved design for making the Cursor Coworker skill easier to trigger in Claude Code without changing the existing delegation flow. This document authorizes implementation planning; implementation requires a separate plan.

## Problem

The `cursor-coworker` skill currently excludes questions already answered by indexed repository context such as CodeGraph in its frontmatter description. Claude Code uses that description for implicit skill selection before it loads the workflow body. When CodeGraph is available, the exclusion can therefore hide Cursor Coworker even for broad, cross-cutting analysis where delegation would preserve the parent agent's context.

Repository indexes and search tools solve a different part of exploration from Cursor Coworker. They efficiently locate symbols, files, and call paths. Cursor Coworker delegates bounded synthesis across unfamiliar architecture, multiple modules, component variants, or cross-cutting risks. Availability of an index must not by itself disable delegation.

## Decision

Keep indexes, search tools, and local context as the preferred path for targeted lookup. Make Cursor Coworker eligible for broad read-only exploration even when another tool supplies partial repository context.

The skill description will:

- retain the existing positive triggers for unfamiliar architecture, multi-module flow tracing, component comparison, and cross-cutting risk analysis;
- add an explicit positive trigger for broad synthesis where an index may identify entry points but does not replace delegated analysis;
- retain negative triggers for a known file or symbol, trivial searches, non-repository research, and tasks whose primary purpose is editing files;
- stop treating the mere availability of another repository tool or preloaded context as a negative trigger.

The workflow body will explain the boundary in operational terms: use existing tool output or native context for a narrow answer already in hand; use Cursor Coworker when answering still requires broad reading or synthesis. It will not require another tool attempt before delegation and will not add tool-specific runtime behavior.

The canonical skill asset remains vendor- and tool-agnostic. It will not name CodeGraph or any competing repository tool in its frontmatter or body. Named tools may appear in external trigger fixtures and benchmark documentation as realistic compatibility scenarios, never as dependencies or selection logic.

## Resulting selection model

| Question shape | Preferred path |
| --- | --- |
| Read a known file or symbol | Existing index, search tool, or native local tool |
| Perform a trivial text or filename search | Existing index, search tool, or native local tool |
| Explain unfamiliar architecture across modules | Cursor Coworker |
| Trace a request or data flow across modules | Cursor Coworker |
| Compare implementations or identify cross-cutting risks | Cursor Coworker |
| Indexed context already contains a complete narrow answer | Use that context; do not delegate |
| An index provides entry points but broad synthesis is still required | Cursor Coworker |

This is a semantic boundary, not runtime routing. Claude Code remains responsible for selecting the skill from its description.

## Unchanged flow

The existing read-only workflow remains authoritative:

1. Select the skill only for a bounded repository-exploration question.
2. Invoke `cursor-coworker analyze` in the repository already in scope.
3. Accept only a valid version 1 result envelope with completed technical and task states, a non-empty summary, and usable evidence.
4. Use cited evidence as focused context and verify proportionally to downstream risk.
5. Fall back once to native read-only exploration when delegation is unusable.

The change does not affect:

- the `analyze` command or its JSON contract;
- the installer, host destinations, or package layout;
- the one-time local fallback and no-retry policy;
- the prohibition on `cursor-coworker run` from the skill;
- Git, worktree, scheduling, concurrency, or review ownership;
- stdout and stderr guarantees;
- authentication or transcript-retention behavior.

## Alternatives considered

### Prefer Cursor Coworker for every repository question

Rejected because it would delegate known-symbol reads and trivial searches, increasing latency, usage, and false-positive activation without preserving meaningful context.

### Use Cursor Coworker only after CodeGraph fails

Rejected because it preserves the discoverability problem. Claude Code would need to select and evaluate CodeGraph first, and Cursor Coworker would remain hidden when indexed context is partial rather than absent.

### Add CodeGraph-aware runtime routing

Rejected because it would couple the CLI to an optional repository tool and violate the existing non-goal of dedicated CodeGraph integration. The required improvement is a skill-selection boundary, not orchestration.

## Testing strategy

### Deterministic standard suite

Update the canonical skill-asset tests to prove that:

- frontmatter positively describes broad synthesis even with indexed entry points;
- no repository index or search product is named in the canonical skill asset;
- another tool's availability is not encoded as an unconditional exclusion;
- targeted known-file, known-symbol, and trivial-search exclusions remain present;
- the complete read-only delegation, envelope validation, fallback, and safety contract remains unchanged;
- the skill contains no `cursor-coworker run` invocation and no transcript-retention option.

Update the trigger fixture corpus with positive cases that explicitly mention CodeGraph while still requiring multi-module synthesis. Keep negative CodeGraph cases whose prompts already identify a narrow symbol or contain a complete indexed answer. The corpus must continue to contain balanced, unique positive and negative cases.

No standard test invokes Claude Code, Codex, Cursor, CodeGraph, or an authenticated account.

### Opt-in Claude Code trigger experiment

Run the existing project-installed skill experiment with a recording fake `cursor-coworker` executable on `PATH`. Score at least these categories:

- broad exploration without CodeGraph mentioned;
- broad exploration with CodeGraph available or already used for entry points;
- narrow known-symbol lookup with CodeGraph available;
- a prompt whose indexed context already contains a complete narrow answer.

The existing acceptance thresholds remain unchanged:

- at least 80% correct delegation on positive cases;
- no more than 10% false-positive delegation on negative cases;
- no write-capable invocation from the skill corpus.

An authenticated Cursor experiment remains optional and separate from trigger scoring.

## Rollout

1. Change only the canonical skill asset and its deterministic activation fixtures/tests.
2. Run the focused skill tests, then `npm run check`.
3. Install the built skill into a disposable Claude Code project.
4. Run the fake-executable Claude Code trigger experiment when the host is locally available.
5. Compare broad CodeGraph-positive activation with the unchanged narrow-query false-positive rate.

If activation remains below the existing threshold after one description revision, reconsider a distribution plugin or MCP adapter as already allowed by the original read-only skill design. Do not add either in this change.
