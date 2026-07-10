# Cursor Coworker Design

## Status

Approved design for an experimental open-source CLI. This document authorizes specification work only; implementation requires a separate plan.

## Problem statement

Claude Code, Codex, and similar coding agents can spend substantial context exploring repositories before they can reason about a task. Developers who already have an authenticated Cursor seat should be able to delegate that exploration, receive a compact and verifiable result, and preserve the primary agent's context.

The project is not premised on free or unmetered model access. Cursor usage remains subject to the user's plan, usage pools, regional availability, administrative policy, and possible on-demand charges. Cost and quota distribution are hypotheses to measure, not product promises.

## Initial users

- Individual developers who use Claude Code or Codex alongside a personal Cursor subscription.
- Teams that use an enterprise primary agent and Cursor Teams seats.
- Existing agent orchestrators that can invoke a normal subprocess.

The first company scenario is a Claude enterprise environment paired with a Cursor Teams Standard seat. The public project must remain useful outside that environment.

## Product contract

The product is a thin CLI that delegates a bounded task to the locally installed Cursor Agent CLI. It exposes two deliberately separate capabilities:

- `analyze`: read-only repository exploration that returns compact findings and evidence.
- `run`: direct implementation in a caller-selected working directory.

The caller owns task selection, working-directory selection, Git branches, worktrees, scheduling, and concurrency. The CLI does not become another orchestrator.

The desired five-minute demonstration is:

1. Install the package.
2. Reuse an existing Cursor login.
3. Give Claude Code or Codex the generated delegation instructions.
4. Delegate a large, possibly parallel, repository analysis.
5. Receive a small evidence-backed result that the primary agent can use without repeating the exploration.

A secondary demonstration delegates a bounded implementation and reports the resulting changes and verification evidence.

## Verified technical assumptions

The following claims were checked against current official documentation and the locally installed Cursor Agent CLI on 2026-07-10:

- Browser-based login can authenticate the CLI with an existing Cursor account.
- Headless execution is supported with print mode.
- `auto` is an available model identifier and the current default route.
- The installed CLI exposes Ask and Plan modes as read-only modes.
- Headless writes require explicit force approval.
- Text, aggregate JSON, and streaming NDJSON output formats are supported.
- A working directory can be selected explicitly.
- Successful JSON output includes a result, duration, session identifier, and request identifier.
- Invalid model selection returns a non-zero exit code.
- Aggregate JSON is not guaranteed on failure.
- Cursor supplies sandbox controls and native worktree support, though this project will not manage worktrees.
- Enterprise administrators can restrict headless mode and execution permissions.
- Current Cursor plans meter usage through separate first-party and third-party pools.
- Auto and Composer 2.5 use the first-party pool. Named third-party models use the third-party pool.
- Cursor Teams may apply on-demand charges, and on-demand usage is enabled by default according to current documentation.
- The installed account currently exposes both `auto` and `composer-2.5`.

A local read-only probe using the authenticated seat, `auto`, Ask mode, an explicit workspace, and aggregate JSON completed successfully.

## Unverified or variable assumptions

- The exact included allowance for a Teams Standard seat is not publicly quantified sufficiently to predict tasks per month.
- Per-task usage may not always be available directly in the final CLI event. Dashboard deltas may be required.
- Auto's underlying model and quality may vary over time.
- Generated `CLAUDE.md` and `AGENTS.md` guidance may not reliably influence every host-agent version or every Superpowers workflow.
- A compact result may omit details that cause the primary agent to repeat repository reads.
- Company policy may prohibit headless execution even when local authentication succeeds.
- Cursor's flags, event schema, pricing, and plan behavior may change.
- Windows behavior has not been locally verified.

These uncertainties are benchmark or compatibility questions. The CLI must not convert them into guarantees.

## Product shapes considered

### Thin CLI — selected

A normal command callable by humans, scripts, Claude Code, Codex, or another orchestrator.

Benefits:

- Lowest integration burden.
- Useful without MCP support.
- Straightforward subprocess, timeout, and output testing.
- Preserves existing orchestration.

Trade-off: host agents need concise instructions explaining when and how to delegate.

### MCP server only — rejected for the MVP

Benefits: discoverable structured tools inside compatible hosts.

Trade-offs: per-host configuration, less transparent debugging, protocol dependency, and disproportionate surface area before delegation value is established.

### CLI plus MCP adapter — deferred

Benefits: broad direct use plus native MCP discovery.

Trade-off: two public surfaces to document and test before the core hypothesis is validated.

An MCP adapter may be considered only after the benchmark succeeds and real usage shows that host instructions are inadequate.

## Interface

The npm package and executable are both named `cursor-coworker`. It exposes four initial commands:

```text
cursor-coworker analyze --task "..." [--cwd PATH] [--model MODEL]
cursor-coworker run     --task "..." [--cwd PATH] [--model MODEL]
cursor-coworker doctor
cursor-coworker instructions claude|codex
```

### `analyze`

- Launches Cursor in headless Ask mode.
- Does not grant write permission.
- Can be invoked concurrently by an external orchestrator.
- Requests a compact answer with evidence rather than a transcript.

### `run`

- The command itself is the caller's explicit authorization to write.
- Launches Cursor headlessly with the permissions required to modify the selected working directory.
- Uses the Cursor sandbox by default.
- Allows an explicit sandbox override for tasks that require it.
- Does not add a second interactive confirmation that would block automation.

### `doctor`

Checks without running a task:

- Cursor Agent presence and version.
- Authentication state.
- Requested model availability.
- Headless capability where it can be determined safely.

It reports actionable remediation without exposing account details or credentials.

### `instructions`

Prints a minimal block suitable for `CLAUDE.md` or `AGENTS.md`. The guidance teaches a host agent to:

- delegate context-heavy repository work;
- choose `analyze` or `run` according to required permissions;
- keep the returned envelope compact;
- leave scheduling, Git isolation, and conflict handling to the current orchestrator.

The guidance is additive. It does not modify or fork Superpowers.

## Configuration

Configuration precedence is:

1. CLI option.
2. Environment variable.
3. Built-in default.

Initial defaults:

- Model: `auto`.
- Working directory: current directory.
- Sandbox: enabled for writes.
- Raw transcript retention: disabled.
- Output: stable JSON envelope on stdout.
- Diagnostics: stderr.

The model option remains generic, but the initial product and benchmark support only `auto` and `composer-2.5` as documented paths.

## Execution flow

1. Validate arguments and resolve the working directory.
2. Check the requested operation's permission contract.
3. Build a bounded prompt for either analysis or implementation.
4. Spawn Cursor directly with an argument array and no intermediary shell.
5. Consume structured events while enforcing cancellation and deadline policy.
6. Require a valid terminal success event before claiming technical success.
7. Normalize the final answer and deterministic metadata.
8. Emit one stable JSON envelope on stdout.

Progress and diagnostics go to stderr so stdout remains machine-readable.

## Output contract

The stable envelope contains:

- `status`: technical and functional completion states.
- `summary`: compact content intended for the primary agent.
- `evidence`: file paths, symbols, commands, tests, or other cited support.
- `changes`: workspace observations for `run`.
- `execution`: duration, requested model, Cursor identifiers, and exit state.
- `usage`: observed usage fields or an explicit `unknown` state.
- `warnings`: dirty workspace, sandbox override, incomplete usage, schema degradation, or other relevant caveats.

The wrapper may request structured content from Cursor, but model-generated evidence is not treated as deterministic. The normalizer validates shape; it does not invent missing facts.

For `run`, the workspace observer records Git state before and after execution where Git is available. It reports observed differences without claiming that every difference was caused by Cursor, because concurrent writes are explicitly permitted.

## Transcript policy

The wrapper creates no persistent raw transcript by default. An explicit CLI option, with an equivalent environment variable for automation, enables diagnostic retention.

When enabled:

- the file uses restrictive local permissions;
- its location is reported;
- secrets are excluded where the wrapper controls logging;
- it is never returned automatically to the primary agent.

Cursor may retain its own session data independently. Documentation must distinguish Cursor's retention and company policy from the wrapper's optional diagnostic copy.

## Module boundaries

- `cli`: argument parsing, help, user-facing errors, and process exit codes.
- `config`: typed configuration and precedence resolution.
- `cursor-adapter`: installed-capability detection and Cursor argument construction.
- `task-contracts`: prompts and result schemas for `analyze` and `run`.
- `process-runner`: direct spawning, structured streaming, deadlines, and cancellation.
- `result-normalizer`: conversion from Cursor events to the stable public envelope.
- `workspace-observer`: read-only before/after workspace and Git observations.

Each module has one public responsibility and can be tested without a real Cursor account. The Cursor event schema remains behind `cursor-adapter` so upstream changes do not leak into the public interface.

## Error handling

- Missing executable, missing authentication, unavailable model, or invalid directory fails before task execution where possible.
- A policy restriction has a distinct actionable error classification.
- Timeout terminates Cursor, waits for a short grace period, then forces termination if required.
- Ctrl-C propagates cancellation and returns an interruption exit status.
- Malformed output or a missing terminal event fails explicitly; the wrapper does not fabricate successful JSON.
- Technical completion and task completion remain distinct.
- Sensitive environment variables and authentication material are never included in normal diagnostics.
- Partial raw output remains in memory unless diagnostic retention was explicitly enabled.

## Safety model

- `analyze` and `run` are separate commands with separate permission profiles.
- Cursor is spawned without a shell to avoid argument injection.
- `run` modifies the caller-provided directory directly.
- The wrapper creates no branch, commit, patch workflow, or worktree.
- The wrapper permits concurrent writes and does not queue or lock them.
- Documentation warns that concurrent writers can conflict.
- The caller owns repository isolation, branch selection, backups, secrets exposure, and coordination.
- Sandbox disablement is explicit and reported in the result.
- The wrapper does not automatically expose additional paths or network access.

## Compatibility with existing workflows

### Superpowers

The MVP does not patch, fork, or replace Superpowers. Generated project instructions recommend delegation where appropriate. The benchmark measures whether these general instructions are followed during real Superpowers plan execution.

A dedicated companion skill is considered only if rules-based integration proves unreliable.

### CodeGraph

There is no CodeGraph-specific runtime behavior in the MVP. The CLI must not interfere with repository instructions, Cursor configuration, MCP servers, or commands that already direct Cursor to CodeGraph. Compatibility is a non-regression check, not a feature.

### Output optimizers

Headroom and command-output optimizers remain external and complementary. Documentation warns that the final JSON envelope must not be filtered or truncated.

## Technology and distribution

- TypeScript on a current supported Node.js LTS.
- Published as an npm package with an executable.
- Usable through both global installation and `npx`.
- Minimal runtime dependencies.
- No daemon, hosted service, telemetry, or required account beyond Cursor.
- Public GitHub repository under the MIT license.
- Repository, npm package, and executable name: `cursor-coworker`.
- The public README states prominently that the project is independent and is not affiliated with or endorsed by Cursor.

The repository should be easy for humans and coding agents to navigate: narrow modules, explicit contracts, short examples, deterministic tests, concise agent instructions, and documented decisions.

## Testing strategy

### Standard suite

- Unit tests for configuration, arguments, prompts, schemas, and error mapping.
- A fake Cursor executable for successful JSON, NDJSON streaming, malformed output, timeout, cancellation, stderr, and non-zero exit behavior.
- Fixture repositories for clean, dirty, Git, and non-Git workspace observation.
- Tests that stdout contains only the promised envelope.
- No authenticated or billable Cursor call.

### Opt-in integration suite

- Real installed Cursor Agent.
- Existing local authentication.
- Read-only probe with `auto`.
- Read-only probe with `composer-2.5`.
- Bounded write task in an expendable fixture.
- Cancellation and version compatibility checks where safe.

CI must run the standard suite without Cursor credentials. Authenticated tests remain explicitly local or run in a separately approved environment.

## Benchmark plan

Use several representative repositories and fixed tasks covering:

- architecture explanation;
- multi-module flow tracing;
- comparison across modules;
- defect or regression analysis;
- one bounded implementation with tests.

Compare three execution paths:

1. Primary agent alone.
2. Native primary-agent subagent.
3. Cursor delegation through the CLI.

Compare only `auto` and `composer-2.5` in the initial Cursor matrix. Repeat scenarios to reduce run variance.

Measure:

- primary-agent input/context consumption;
- Cursor usage when directly exposed, otherwise carefully bounded dashboard deltas;
- blind factual quality score;
- correctness of citations and evidence;
- frequency with which the primary agent must reopen sources;
- latency and technical failure rate;
- correct delegation prompted by generated `CLAUDE.md` or `AGENTS.md` guidance;
- installation-to-first-result time.

The benchmark materials, scoring rubric, raw measurements, and limitations should be published reproducibly without publishing proprietary repositories or data.

## Continuation and abandonment evidence

Continue beyond the experiment when all of the following hold:

- At least 30% reduction in primary-agent context consumption.
- At least 80% of delegated results are directly usable without repeating the analysis.
- No increase in critical factual errors.
- Cursor usage is sufficiently observable and predictable to avoid misleading cost claims.
- A new user can install, diagnose, and obtain the first result within five minutes.

Abandon or reposition when any of the following hold:

- A direct Cursor invocation with a good prompt performs equivalently, making the wrapper redundant.
- Context reduction remains below the threshold.
- Primary agents regularly reopen the same sources because compact results are insufficient.
- Usage cannot be attributed well enough for safe team deployment.
- Generated host instructions are too unreliable and no small integration can fix them.
- Cursor CLI churn makes the stable envelope too costly to maintain.

## Strongest technical and product risks

- The project shifts cost between subscriptions without reducing total cost.
- Output compaction removes a detail needed for correct downstream reasoning.
- Auto quality and routing vary over time.
- Composer 2.5 may be cheaper but require enough retries to lose its apparent advantage.
- Enterprise policy can disable the necessary execution mode.
- Concurrent direct writes can conflict.
- Cursor schema or permission changes can break the adapter.
- A wrapper may be too small to justify a maintained public project.

## Explicit non-goals

- MCP server in the MVP.
- Multi-agent framework or scheduler.
- Automatic decisions about when to delegate.
- Replacement or fork of Superpowers.
- Dedicated CodeGraph integration.
- Intelligent model routing.
- Branch, commit, patch, or worktree management.
- Concurrent-write locking or queuing.
- Graphical interface.
- Persistent interactive Cursor conversations.
- Support guarantees for every model or orchestrator.
- Claims of free usage, unlimited usage, or guaranteed savings.
- Billing, quota, regional, or enterprise-policy guarantees.

## Publication sequence

1. Commit this approved design locally.
2. Create a separate implementation plan.
3. Implement and verify the experiment locally.
4. Perform security, documentation, naming-conflict, and release review.
5. Create and publish the GitHub repository only with explicit confirmation of the final public contents.
6. Publish the npm package only after the benchmark harness and limitations are documented.
