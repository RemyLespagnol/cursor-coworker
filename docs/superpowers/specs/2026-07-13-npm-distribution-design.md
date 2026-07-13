# npm Distribution Design

## Status

Approved design for making Cursor Coworker installable as a public npm CLI and shipping subsequent releases from GitHub Actions with npm provenance.

## Problem

The GitHub repository is public and already contains a working CLI plus an installable Codex/Claude skill, but `cursor-coworker` does not exist in the npm registry. The README currently recommends `npx cursor-coworker`, so a new user cannot follow the documented quick start.

The release path must make the CLI and its bundled skill available without requiring users to clone or build the repository.

## User experience

A user can run a one-off command without installation:

```bash
npx cursor-coworker doctor
```

A regular user can install the CLI globally, install the companion skill, and verify the environment:

```bash
npm install --global cursor-coworker
cursor-coworker install-skill codex --scope user
cursor-coworker doctor
```

Claude Code users replace `codex` with `claude`. Project-scoped skill installation remains available by omitting `--scope user`.

The package name, executable name, and repository name remain `cursor-coworker`.

## Release architecture

The first public release is `0.1.0`. It is bootstrapped manually with `npm publish --access public` after all local release checks pass. This creates the npm package so its settings can be configured with the GitHub repository as a trusted publisher.

Every later release is published by a GitHub Actions workflow triggered by a version tag matching `v*`. The workflow:

1. Checks out the tagged commit.
2. Installs the Node.js version declared by the project and configures the public npm registry.
3. Runs `npm ci`.
4. Runs the full project check.
5. Verifies that the tag version exactly matches `package.json`.
6. Performs an npm package dry run.
7. Publishes to npm through trusted publishing with provenance.

The workflow receives `id-token: write` and `contents: read` only. It stores no long-lived npm token. GitHub environment protection is unnecessary for the initial design; tag creation remains the maintainer-controlled release gate.

## Package safeguards

`package.json` changes from version `0.0.0` to `0.1.0` and declares the package public. A `prepublishOnly` script runs the full project check so a direct local publish cannot bypass build and tests.

The existing `files` allowlist remains authoritative. A release verification script checks the produced tarball manifest for the minimum runtime contract:

- `dist/src/cli.js`;
- the runtime modules imported by the CLI;
- `dist/skills/cursor-coworker/SKILL.md`;
- `README.md`;
- `LICENSE`;
- `package.json`.

It also verifies that the declared executable resolves to an included file. Benchmark files may remain in the package because the current public package contract includes the reproducible benchmark; removing them is outside this distribution change.

## Documentation

The README leads with two explicit paths:

- one-off use through `npx`;
- global installation followed by optional Codex or Claude skill installation.

The quick start explains that installing the npm package provides both the `cursor-coworker` executable and the skill asset consumed by `install-skill`. It does not instruct users to copy files from GitHub.

A maintainer release document records the bootstrap and recurring processes separately:

- local authentication and checks for the first `0.1.0` publication;
- trusted-publisher configuration on npm after the package exists;
- version bump, commit, and `v<version>` tag for later releases;
- registry and executable smoke checks after publication.

## Failure handling

- CI fails before publication when tests, build, package contents, or version/tag matching fail.
- npm rejects a duplicate version; the workflow never rewrites or replaces a published release.
- A failed workflow leaves the existing npm release untouched. Recovery requires a new patch version and tag if any package content changes.
- A failed initial publication must not be retried until its npm output is checked to determine whether the version was created.
- Post-publication smoke verification runs the registry package with `npx`; it must not invoke an authenticated or billable Cursor task.

## Testing and verification

Standard tests remain independent of a real authenticated Cursor account.

Release verification covers:

1. `npm run check` passes.
2. The package-content verifier accepts `npm pack --dry-run --json` output.
3. The packed CLI can execute a non-billable argument or help/error path from an isolated temporary directory.
4. The packed CLI installs its bundled skill into a temporary destination.
5. The GitHub workflow validates tag/package version equality before `npm publish`.
6. After publication, `npm view cursor-coworker@<version>` reports the expected version and `npx cursor-coworker@<version> doctor` resolves the public executable. `doctor` may report that Cursor is unavailable; executable resolution is the smoke-test requirement.

## Scope

This change includes npm packaging safeguards, public installation documentation, release documentation, and the GitHub Actions npm release workflow.

It does not add another package manager, an installer shell script, Git orchestration, telemetry, an MCP server, or model-specific behavior. The skill continues to be installed by the CLI and is not published as a separate package.

## Publication gate

Publishing `0.1.0` changes external registry state and is irreversible. Implementation may prepare and verify the exact package without another design decision, but the final `npm publish --access public` command requires an explicit user confirmation after the tarball contents and checks are reported.
