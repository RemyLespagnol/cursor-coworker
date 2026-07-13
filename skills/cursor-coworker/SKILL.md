---
name: cursor-coworker
description: Delegate bounded read-only repository exploration to Cursor Coworker. Use for broad synthesis across unfamiliar architecture, request or data flows, unknown implementations, component comparisons, and cross-cutting risks, including when existing repository tools or context supply only entry points. Do not use for a known file or symbol, trivial searches, a complete narrow answer already present in context, non-repository research, or tasks whose primary purpose is editing files.
---

# Cursor Coworker read-only exploration

Use this workflow only for repository exploration. The parent workflow keeps responsibility for planning, edits, verification, Git, concurrency, and review.

## Choose existing context or delegation

Use existing repository tool output or the host's native context directly when it already provides a complete narrow answer about a known file, symbol, caller, or search result. The availability of another tool is not by itself a reason to skip this skill. Delegate when answering still requires broad reading or synthesis across unfamiliar or multiple modules, even if existing context supplied useful entry points.

## Delegate

1. Confirm that the question needs broad read-only exploration or synthesis and matches the description above.
2. Form one bounded question about the behavior, subsystem, comparison, or flow. Do not delegate the entire parent task.
3. Reuse the repository already in scope. Do not create a branch, worktree, clone, or temporary repository.
4. Requires `cursor-coworker` installed globally (`npm install --global cursor-coworker`) and on `PATH`; a one-off `npx cursor-coworker` invocation does not satisfy this.
5. Invoke through the host's normal shell capability:

   `cursor-coworker analyze --task "<bounded-question>" --cwd "<repository>"`

Do not enable transcript retention or broaden permissions.

## Accept a result

Parse stdout as one JSON object. A usable result requires all of:

- `schemaVersion` equals `1`;
- `status.technical` equals `"completed"`;
- `status.task` equals `"completed"`;
- `summary` is non-empty;
- `evidence` contains at least one usable item.

Surface relevant `warnings`. Treat malformed JSON, a non-zero process exit, an unsupported schema version, incomplete status, an empty summary, or missing evidence as unusable.

Use a successful summary and its cited evidence as focused context. Inspect cited sources when downstream risk requires verification, but do not reflexively repeat the broad exploration. Model-produced findings are not deterministic truth.

## Recover

Fall back once to the host's native read-only exploration when delegation is unusable. Do not automatically retry delegation and do not switch to a write-capable operation.

If the executable, authentication, model, or policy is unavailable, surface the diagnostic and suggest `cursor-coworker doctor`. Never request or expose a raw transcript.
