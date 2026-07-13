# Read-Only Agent Skill Design

## Status

Approved design for automating read-only Cursor Coworker delegation from Codex and Claude Code. This document authorizes implementation planning; implementation requires a separate plan.

## Problem

`cursor-coworker analyze` already gives a primary coding agent a compact, evidence-backed result, but the primary agent must still decide when to delegate and remember the command and result-handling contract. The generated `AGENTS.md` and `CLAUDE.md` guidance is intentionally short and does not define a complete reusable workflow.

The first automation must improve discovery and correct use of read-only delegation without turning Cursor Coworker into an orchestrator. It must not grant write authority, choose Git isolation, schedule work, or add authenticated calls to the standard test suite.

## Decision

Ship one portable Agent Skill named `cursor-coworker` and a CLI command that installs it for either Codex or Claude Code. The skill may invoke only `cursor-coworker analyze`. It must never invoke or recommend automatic invocation of `cursor-coworker run`.

The initial installation scope is project-local and versionable. An explicit user-scope option is supported for users who want the same workflow in every repository.

No custom host agent, lifecycle hook, or MCP server is added in this phase.

## Why a skill

Both Codex and Claude Code support the Agent Skills format: a `SKILL.md` file with a description used for explicit or implicit activation and instructions loaded only when the skill is selected.

A skill fits the requirement because the automation is a semantic workflow: recognize context-heavy exploration, formulate a bounded question, invoke a subprocess, validate its result, and decide whether to fall back. A hook sees lifecycle events but cannot reliably infer that intent. A custom subagent would add a host-specific agent layer whose main job is only to launch the existing Cursor agent. MCP would improve tool discovery but would add a second public protocol surface before skill reliability has been measured.

Official references:

- Codex skills: https://learn.chatgpt.com/docs/build-skills
- Claude Code skills: https://code.claude.com/docs/en/skills
- FastContext: https://github.com/microsoft/fastcontext

## Public interface

Add this command without changing the existing delegation contracts:

```text
cursor-coworker install-skill codex|claude [--scope project|user] [--cwd PATH]
```

Defaults:

- `--scope project`
- `--cwd` uses the current working directory

Destinations:

| Host | Project scope | User scope |
| --- | --- | --- |
| Codex | `<cwd>/.agents/skills/cursor-coworker/SKILL.md` | `~/.agents/skills/cursor-coworker/SKILL.md` |
| Claude Code | `<cwd>/.claude/skills/cursor-coworker/SKILL.md` | `~/.claude/skills/cursor-coworker/SKILL.md` |

The command prints one machine-readable JSON result on stdout. Diagnostics go to stderr. It creates parent directories when needed and fails if the destination already exists. This phase has no overwrite or merge option.

Successful installation returns this public result shape:

```json
{"schemaVersion":1,"status":"installed","host":"codex","scope":"project","path":"/absolute/path/to/.agents/skills/cursor-coworker/SKILL.md"}
```

`host` is `codex` or `claude`, and `scope` is `project` or `user`. `path` is the resolved absolute destination. Installation errors write one actionable diagnostic to stderr, leave stdout empty, return a non-zero exit code, and do not leave a partial skill file.

The npm package includes one canonical skill asset. Installation copies that asset to the host-specific destination; host-specific copies are not maintained as separate sources.

The canonical asset uses only portable Agent Skills fields required by both hosts: `name` and `description`. It does not use Claude-only dynamic context injection, host-specific tool names, or Codex-specific configuration. The workflow body tells the selected host to invoke the CLI through its normal shell tool.

## Skill activation contract

The skill description must make both positive and negative triggers explicit.

Use the skill for bounded read-only questions that would otherwise require broad repository exploration, including:

- explaining an unfamiliar architecture;
- tracing a request or data flow across multiple modules;
- locating an implementation when the relevant files are unknown;
- comparing behavior across components;
- identifying cross-cutting risks or change surfaces.

Do not use the skill for:

- reading a known file or symbol;
- a trivial text or filename search;
- questions already answered by available indexed repository context such as CodeGraph;
- tasks whose primary purpose is modifying files;
- non-repository research;
- retrying a previous Cursor Coworker failure automatically.

Explicit invocation remains available even when implicit matching would not select the skill.

## Skill workflow

1. Confirm that the task is read-only repository exploration and matches a positive trigger.
2. Form one bounded question describing the behavior, subsystem, comparison, or flow to locate. Preserve relevant user constraints but do not delegate the entire parent task.
3. Resolve the repository working directory already in scope. Do not create a branch, worktree, clone, or temporary repository.
4. Invoke:

   ```text
   cursor-coworker analyze --task "<bounded question>" --cwd "<repository>"
   ```

5. Parse stdout as the existing `ResultEnvelope` contract and require:

   - `schemaVersion === 1`;
   - `status.technical === "completed"`;
   - `status.task === "completed"`;
   - a non-empty summary;
   - at least one usable evidence item.

6. Surface relevant warnings. Treat malformed JSON, a non-zero process exit, an unexpected schema version, incomplete task status, or missing evidence as an unusable delegation.
7. When usable, return the compact findings to the parent workflow. Inspect cited files only when the downstream task needs stronger verification; do not reflexively repeat the delegated exploration.
8. When unusable, fall back once to the host's native read-only exploration. Do not automatically rerun Cursor Coworker and do not invoke `run`.

The skill does not run `doctor` before every delegation. On executable, authentication, or policy failures, it reports the failure and suggests `cursor-coworker doctor` as remediation.

## Result handling

The skill treats Cursor's summary and evidence as model-produced findings, not deterministic truth. The stable envelope proves execution state and validates evidence shape; it does not prove that every cited claim is correct.

The parent agent remains responsible for deciding whether a claim requires direct source verification before answering, planning, or editing. Verification should be proportional to risk and should prefer cited evidence over another broad repository scan.

The skill must not request or expose raw transcripts. Transcript retention remains disabled unless the user independently enables it outside this workflow.

## Error handling

| Condition | Skill behavior |
| --- | --- |
| Command not found | Stop delegation, fall back locally, suggest installation or `doctor` |
| Authentication or policy failure | Stop delegation, fall back locally, surface the actionable diagnostic |
| Timeout or interruption | Stop delegation, fall back locally, do not retry automatically |
| Malformed or unsupported envelope | Treat as unusable and report the schema problem |
| Technical failure | Surface the summary and warnings, then fall back locally |
| Functionally incomplete result | Preserve useful partial context as a hint, but verify locally |
| Missing evidence | Treat the result as incomplete and verify locally |
| Existing installation target | Fail without changing the existing skill |

Failures never authorize broader permissions or a write-capable operation.

## Safety and scope

- The skill can invoke only `analyze`.
- The installer writes only the selected skill destination.
- Project installation does not modify global host configuration.
- User installation requires explicit `--scope user`.
- The skill does not manage Git, worktrees, scheduling, concurrency, or retries.
- The skill does not enable transcript retention, sandbox overrides, telemetry, or network access.
- Standard tests use fixtures and fake executables and never call an authenticated Cursor account.
- Existing stdout and stderr guarantees remain unchanged.

## FastContext relationship

FastContext independently validates the selected architecture: a primary coding agent delegates broad repository reading to a read-only explorer and consumes compact file-and-line citations. Its bounded turns, read-only tool set, citation-focused output, and explicit explorer/solver separation are useful design references.

FastContext is not a runtime dependency in this phase. Adding it would introduce Python 3.12, a separately served OpenAI-compatible model, additional credentials or local model setup, and a second explorer backend before Cursor Coworker's host-trigger reliability is known.

After the skill experiment, FastContext may be added as an opt-in benchmark provider. That comparison should measure result usability, citation precision, primary-agent token reduction, latency, and operational setup independently from Cursor.

## Testing strategy

### Standard suite

Use temporary fixture directories and fake executables. Tests cover:

- argument parsing for both hosts and both scopes;
- default project scope and current-directory resolution;
- exact destination selection;
- creation of parent directories;
- refusal to overwrite an existing skill;
- canonical asset packaging;
- JSON-only stdout and stderr-only diagnostics;
- positive and negative activation examples encoded in the skill;
- successful envelope validation;
- malformed, failed, incomplete, and evidence-free results;
- local fallback instructions;
- absence of any `cursor-coworker run` invocation in the skill asset.

No standard test invokes Codex, Claude Code, Cursor, or a real authenticated account.

### Opt-in host experiment

Run fixed prompts through Codex and Claude Code with the installed project skill. Include prompts that should delegate and prompts that should remain local. First put a recording fake `cursor-coworker` executable on `PATH` so activation can be scored without a Cursor login or billable call. After trigger behavior passes, repeat the positive cases with the real CLI as a separate authenticated experiment. Record:

- correct delegation rate;
- false-positive delegation rate;
- command success rate;
- primary-agent context consumption when observable;
- direct usability of the returned result;
- frequency of broad source re-reading after a successful delegation;
- latency and Cursor usage when observable.

The initial continuation criteria are:

- at least 80% correct delegation on positive cases;
- no more than 10% false-positive delegation on negative cases;
- at least 80% of successful delegated results usable without repeating broad exploration;
- no write-capable invocation from the skill corpus.

Failure to meet the trigger thresholds leads first to revising the skill description and examples. An MCP adapter is reconsidered only if repeated skill revisions still leave discovery unreliable while direct explicit invocation remains useful.

## Rollout

1. Implement the canonical read-only skill asset and deterministic installer.
2. Verify the standard suite with `npm run check`.
3. Install the skill project-locally in a disposable repository for each host.
4. Run the opt-in positive and negative trigger experiment.
5. Revise the skill description once if trigger behavior misses the thresholds.
6. Decide whether to keep the skill-only integration, add a distribution plugin, or reconsider an MCP adapter.
7. Evaluate FastContext as a separate benchmark provider only after the host integration decision.

## Non-goals

- Automatic or skill-mediated use of `cursor-coworker run`.
- A custom Codex or Claude subagent.
- Lifecycle hooks that force or intercept repository exploration.
- An MCP server or adapter in this phase.
- Runtime integration with FastContext.
- Automatic model selection, task scheduling, parallel orchestration, or retries.
- Git, branch, worktree, commit, or conflict management.
- Telemetry or authenticated CI.
