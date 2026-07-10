# Repository guidance

- Start with `docs/superpowers/specs/2026-07-10-cursor-delegation-cli-design.md` for product decisions.
- Public contracts live in `src/types.ts`; Cursor-specific schema handling stays under `src/cursor/` and `src/execution/`.
- Use TDD and run `npm run check` before claiming completion.
- Standard tests must never call a real authenticated Cursor account.
- Keep stdout machine-readable and send diagnostics to stderr.
- Do not add orchestration, Git management, telemetry, or model-specific behavior outside the approved scope.
