# Cursor Coworker

Delegate bounded repository analysis or implementation to an authenticated Cursor Agent CLI and return a compact machine-readable result.

> Cursor Coworker is an independent community project and is not affiliated with or endorsed by Cursor.

## Why

Preserve the primary coding agent's context by moving context-heavy reading to an existing Cursor seat. Usage remains metered by Cursor; this project does not promise free or cheaper execution.

## Requirements

- Node.js 22+
- A current `cursor-agent` installation
- An authenticated Cursor account with headless use permitted by its policy

## Quick start

```bash
npx cursor-coworker doctor
npx cursor-coworker analyze --task "Explain the authentication flow with file evidence" --cwd "$PWD"
```

## Commands

`doctor` checks the local Cursor installation, login, and selected model. `analyze` performs read-only exploration. `run` writes directly to the selected directory. `instructions claude|codex` prints host guidance.

Both delegation commands accept `--cwd`, `--model`, `--timeout`, `--no-sandbox`, `--retain-transcript`, and `--cursor-path`. Use `--no-sandbox` only when the task cannot run inside Cursor's normal sandbox.

## Safety model

`analyze` is read-only. `run` writes directly to the selected directory. The caller owns Git isolation, concurrency, backups, verification, and review. Cursor Teams may have on-demand usage enabled. Raw transcript retention is opt-in and Cursor may separately retain its own session data.

## Output

```json
{"schemaVersion":1,"status":{"technical":"completed","task":"completed"},"summary":"Authentication enters through src/auth.ts.","evidence":[{"kind":"file","value":"src/auth.ts"}],"changes":{"available":false},"execution":{"mode":"analyze","requestedModel":"auto","durationMs":1200,"exitCode":0},"usage":{"state":"unknown"},"warnings":[]}
```

`status` separates process completion from task completion. `summary` and `evidence` are compact model output. `changes` reports Git observations. `execution` contains deterministic run metadata. `usage` is explicit when unavailable. `warnings` exposes safety caveats.

## Models and usage

`auto` is the default. `composer-2.5` is the only initial comparison model. Consult the current Cursor dashboard, plan documentation, and company policy for authoritative usage information.

## Host-agent instructions

```bash
cursor-coworker instructions claude
cursor-coworker instructions codex
```

The generated guidance is additive. It does not modify or replace Superpowers or the host's native subagents.

## Development

```bash
npm install
npm run check
```

Standard tests use a fake executable and make no billable Cursor calls.

## License

MIT
